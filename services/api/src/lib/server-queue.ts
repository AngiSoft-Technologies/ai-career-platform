/**
 * The production server's Redis + BullMQ replacement.
 *
 * SQLite holds the indexed job table; JSONL is the append-only audit stream.
 * It supports delayed jobs, priority, retries with exponential backoff,
 * leases, crash recovery and a polling worker with bounded concurrency.
 *
 * Vercel does not use it: functions have ephemeral filesystems and keep
 * BullMQ/Redis or the Vercel-native event paths. On a long-running server this
 * is the durable queue, so the backend behaves like the server version without
 * requiring Redis to be installed.
 */

import { appendJsonlEvent } from "./server-jsonl-store.js";
import { sqliteDatabase, sqliteTickStoreEnabled } from "./server-sqlite-store.js";
import { serverStoreBackend } from "./server-store.js";
import { logger } from "../logger.js";

export interface ServerQueueJob {
  id: number;
  topic: string;
  payload: unknown;
  attempts: number;
  token: string;
}

export interface EnqueueServerJobOptions {
  delayMs?: number;
  maxAttempts?: number;
  priority?: number;
  dedupeKey?: string;
}

export interface ServerQueueStats {
  pending: number;
  running: number;
  done: number;
  failed: number;
}

export interface ServerQueueWorkerOptions {
  topics?: string[];
  concurrency?: number;
  lockMs?: number;
  reapAfterMs?: number;
  pollMs?: number;
  onError?: (error: unknown, job: ServerQueueJob) => void;
}

export interface ServerQueueWorkerHandle {
  stop: () => Promise<void>;
}

function queueEnabled(): boolean {
  const backend = serverStoreBackend();
  return backend === "sqlite" || backend === "sqlite+jsonl" || sqliteTickStoreEnabled();
}

function assertQueue(): void {
  if (!queueEnabled()) throw new Error("SERVER_STORE_SQLITE_REQUIRED");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function retryDelay(attempts: number): number {
  return Math.min(30 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}

function audit(type: "enqueue" | "ack" | "fail", name: string, payload: unknown): void {
  void appendJsonlEvent({ at: Date.now(), type, name, payload }).catch((error) => {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "Server queue audit write failed",
    );
  });
}

/**
 * Adds a job. A dedupe key makes repeated automation ticks idempotent, so a
 * restart or a second server process cannot double-enqueue the same work.
 */
export async function enqueueServerJob(
  topic: string,
  payload: unknown,
  options: EnqueueServerJobOptions = {},
): Promise<number | null> {
  assertQueue();
  const now = Date.now();
  const store = sqliteDatabase();
  const result = store
    .prepare(
      `INSERT INTO server_jobs
         (topic, payload, status, attempts, max_attempts, priority, run_at,
          dedupe_key, created_at, updated_at)
       VALUES (?, ?, 'PENDING', 0, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
    .run(
      topic,
      JSON.stringify(payload ?? {}),
      boundedInteger(options.maxAttempts, 3, 1, 10),
      boundedInteger(options.priority, 0, -20, 20),
      now + Math.max(0, options.delayMs ?? 0),
      options.dedupeKey ?? null,
      now,
      now,
    );

  if (result.changes === 0) return null;
  const id = Number(result.lastInsertRowid);
  audit("enqueue", topic, { id, payload, delayMs: options.delayMs ?? 0 });
  return id;
}

/** Atomically claims due jobs and gives each one an exclusive lease token. */
export async function claimServerJobs(
  limit = 1,
  lockMs = 60_000,
  workerId = `worker:${process.pid}`,
  topics?: string[],
): Promise<ServerQueueJob[]> {
  if (!queueEnabled()) return [];
  const count = boundedInteger(limit, 1, 1, 50);
  const lock = boundedInteger(lockMs, 60_000, 1_000, 30 * 60_000);
  const store = sqliteDatabase();
  const now = Date.now();
  const topicFilter =
    topics && topics.length > 0
      ? `AND topic IN (${topics.map(() => "?").join(", ")})`
      : "";
  const params: Array<string | number> = [now, now, ...(topics ?? []), count];

  store.exec("BEGIN IMMEDIATE");
  try {
    const rows = store
      .prepare(
        `SELECT id, topic, payload, attempts
           FROM server_jobs
          WHERE status = 'PENDING'
            AND run_at <= ?
            AND (locked_until IS NULL OR locked_until <= ?)
            ${topicFilter}
          ORDER BY priority DESC, run_at ASC, id ASC
          LIMIT ?`,
      )
      .all(...params) as Array<{
      id: number;
      topic: string;
      payload: string;
      attempts: number;
    }>;
    if (rows.length === 0) {
      store.exec("COMMIT");
      return [];
    }

    const claim = store.prepare(
      `UPDATE server_jobs
          SET status = 'RUNNING', locked_until = ?, locked_by = ?, updated_at = ?
        WHERE id = ?`,
    );
    const claimed = rows.map((row) => {
      const token = `${workerId}:${Date.now()}:${row.id}`;
      claim.run(now + lock, token, now, row.id);
      return {
        id: row.id,
        topic: row.topic,
        payload: JSON.parse(row.payload) as unknown,
        attempts: row.attempts,
        token,
      };
    });
    store.exec("COMMIT");
    return claimed;
  } catch (error) {
    store.exec("ROLLBACK");
    throw error;
  }
}

export async function ackServerJob(id: number, token: string): Promise<void> {
  if (!queueEnabled()) return;
  const now = Date.now();
  const result = sqliteDatabase()
    .prepare(
      `UPDATE server_jobs
          SET status = 'DONE', locked_until = NULL, locked_by = NULL,
              last_error = NULL, updated_at = ?
        WHERE id = ? AND locked_by = ?`,
    )
    .run(now, id, token);
  if (result.changes > 0) audit("ack", `job:${id}`, undefined);
}

export async function failServerJob(
  id: number,
  token: string,
  error: string,
  retryDelayMs?: number,
): Promise<void> {
  if (!queueEnabled()) return;
  const store = sqliteDatabase();
  const now = Date.now();
  store.exec("BEGIN IMMEDIATE");
  try {
    const row = store
      .prepare("SELECT attempts, max_attempts, locked_by FROM server_jobs WHERE id = ?")
      .get(id) as
      | { attempts: number; max_attempts: number; locked_by: string | null }
      | undefined;
    if (!row || row.locked_by !== token) {
      store.exec("ROLLBACK");
      return;
    }

    const attempts = row.attempts + 1;
    if (attempts >= row.max_attempts) {
      store
        .prepare(
          `UPDATE server_jobs
              SET status = 'FAILED', attempts = ?, locked_until = NULL,
                  locked_by = NULL, last_error = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(attempts, error.slice(0, 2_000), now, id);
    } else {
      store
        .prepare(
          `UPDATE server_jobs
              SET status = 'PENDING', attempts = ?, run_at = ?,
                  locked_until = NULL, locked_by = NULL, last_error = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          attempts,
          now + (retryDelayMs ?? retryDelay(attempts)),
          error.slice(0, 2_000),
          now,
          id,
        );
    }
    store.exec("COMMIT");
    audit("fail", `job:${id}`, { attempts, error });
  } catch (caught) {
    store.exec("ROLLBACK");
    throw caught;
  }
}

/**
 * Recovers jobs whose worker died before ack/fail. This is the file-backed
 * equivalent of BullMQ's stalled-job check.
 */
export async function reapServerJobs(stalledAfterMs = 5 * 60_000): Promise<number> {
  if (!queueEnabled()) return 0;
  const store = sqliteDatabase();
  const now = Date.now();
  store.exec("BEGIN IMMEDIATE");
  try {
    const stalled = store
      .prepare(
        `SELECT id, attempts, max_attempts
           FROM server_jobs
          WHERE status = 'RUNNING' AND locked_until < ?`,
      )
      .all(now) as Array<{ id: number; attempts: number; max_attempts: number }>;
    for (const job of stalled) {
      const attempts = job.attempts + 1;
      if (attempts >= job.max_attempts) {
        store
          .prepare(
            `UPDATE server_jobs
                SET status = 'FAILED', attempts = ?, locked_until = NULL,
                    locked_by = NULL, last_error = 'worker lease expired', updated_at = ?
              WHERE id = ?`,
          )
          .run(attempts, now, job.id);
      } else {
        store
          .prepare(
            `UPDATE server_jobs
                SET status = 'PENDING', attempts = ?, run_at = ?, locked_until = NULL,
                    locked_by = NULL, last_error = 'worker lease expired', updated_at = ?
              WHERE id = ?`,
          )
          .run(attempts, now + retryDelay(attempts), now, job.id);
      }
    }
    store.exec("COMMIT");
    if (stalled.length > 0) {
      logger.warn({ count: stalled.length }, "Recovered stalled server queue jobs");
    }
    return stalled.length;
  } catch (error) {
    store.exec("ROLLBACK");
    throw error;
  }
}

export function serverQueueStats(): ServerQueueStats {
  if (!queueEnabled()) return { pending: 0, running: 0, done: 0, failed: 0 };
  const rows = sqliteDatabase()
    .prepare("SELECT status, COUNT(*) AS count FROM server_jobs GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  const stats: ServerQueueStats = { pending: 0, running: 0, done: 0, failed: 0 };
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof ServerQueueStats;
    if (key in stats) stats[key] = row.count;
  }
  return stats;
}

/**
 * A polling consumer: the server-side counterpart of a BullMQ Worker.
 * The loop is re-armed from a timer rather than setInterval so a slow handler
 * cannot pile up overlapping polls.
 */
export function startServerQueueWorker(
  handler: (job: ServerQueueJob) => Promise<unknown>,
  options: ServerQueueWorkerOptions = {},
): ServerQueueWorkerHandle {
  const concurrency = boundedInteger(options.concurrency, 2, 1, 20);
  const lockMs = boundedInteger(options.lockMs, 5 * 60_000, 1_000, 30 * 60_000);
  const reapAfterMs = boundedInteger(options.reapAfterMs, 5 * 60_000, 1_000, 30 * 60_000);
  const pollMs = boundedInteger(options.pollMs, 1_000, 100, 30_000);
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight = 0;

  const poll = async (): Promise<void> => {
    if (stopped || !queueEnabled()) return;
    try {
      await reapServerJobs(reapAfterMs);
      const jobs = await claimServerJobs(
        Math.max(0, concurrency - inFlight),
        lockMs,
        `server:${process.pid}`,
        options.topics,
      );
      await Promise.allSettled(
        jobs.map(async (job) => {
          inFlight += 1;
          try {
            await handler(job);
            await ackServerJob(job.id, job.token);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await failServerJob(job.id, job.token, message);
            options.onError?.(error, job);
          } finally {
            inFlight -= 1;
          }
        }),
      );
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Server queue poll failed",
      );
    } finally {
      if (!stopped) {
        timer = setTimeout(() => void poll(), pollMs);
        timer.unref?.();
      }
    }
  };

  void poll();
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      // Jobs keep their lease; another replica or the next boot recovers them.
    },
  };
}
