import { metric } from "@vercel/functions";
import { redis } from "../../db/redis.js";
import { logger } from "../../logger.js";
import { runServerlessPreparationCycle } from "../application/serverless-preparations.js";
import {
  JOB_NAMES,
  runServerlessJob,
  type JobName,
} from "../../worker/index.js";

/**
 * Vercel adapter for the backend's periodic work.
 *
 * A persistent host keeps the BullMQ worker and its ticker. On Vercel there is
 * no always-on process, so one scheduled invocation runs a bounded slice of the
 * same handlers. User-triggered work starts immediately through `waitUntil`;
 * this cycle is the safety net for retries, cleanup and work with no request.
 *
 * Only one schedule is used. Hobby allows 5,000 scheduled runs per billing
 * period, so separate crons for every job would exhaust the allowance.
 */

const CYCLE_LOCK_KEY = "backend:cycle:lock";
const CYCLE_LOCK_SECONDS = 280;
const INGEST_LAST_RUN_KEY = "discovery:schedule:last-run";
const ROTATION_CURSOR_KEY = "backend:cycle:rotation";
const INGEST_INTERVAL_MS = 30 * 60_000;
const CYCLE_BUDGET_MS = 240_000;

/** Must finish on every pass: delayed webhooks and expired leases are user-visible. */
const CORE_JOBS: ReadonlyArray<{ name: JobName; timeoutMs: number }> = [
  { name: JOB_NAMES.dispatchWebhooks, timeoutMs: 45_000 },
  { name: JOB_NAMES.expireApplicationSubmissionLeases, timeoutMs: 20_000 },
];

/** Expensive or low-urgency work is spread across passes. */
const ROTATING_JOBS: ReadonlyArray<{ name: JobName; timeoutMs: number }> = [
  { name: JOB_NAMES.expireOpportunities, timeoutMs: 60_000 },
  { name: JOB_NAMES.pruneEvents, timeoutMs: 30_000 },
  { name: JOB_NAMES.reapStaleRows, timeoutMs: 30_000 },
  { name: JOB_NAMES.evaluateSavedSearchAlerts, timeoutMs: 45_000 },
  { name: JOB_NAMES.sendCalendarReminders, timeoutMs: 30_000 },
  { name: JOB_NAMES.refreshEmbeddings, timeoutMs: 90_000 },
];

const ROTATION_SIZE = 2;

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

async function acquireCycleLock(): Promise<(() => Promise<void>) | null> {
  try {
    const acquired =
      (await redis.set(CYCLE_LOCK_KEY, "1", "EX", CYCLE_LOCK_SECONDS, "NX")) === "OK";
    if (!acquired) return null;
    return async () => {
      await redis.del(CYCLE_LOCK_KEY).catch(() => undefined);
    };
  } catch {
    // Redis is a coordination optimisation. The database handlers use their
    // own claims, so an unavailable Redis must not stop the only clock.
    return async () => undefined;
  }
}

async function isIngestionDue(): Promise<boolean> {
  try {
    const last = await redis.get(INGEST_LAST_RUN_KEY);
    if (!last) return true;
    const elapsed = Date.now() - new Date(last).getTime();
    return !Number.isFinite(elapsed) || elapsed >= INGEST_INTERVAL_MS;
  } catch {
    return true;
  }
}

async function markIngestionStarted(): Promise<void> {
  try {
    await redis.set(INGEST_LAST_RUN_KEY, new Date().toISOString());
  } catch {
    // Discovery is idempotent; without Redis an occasional overlap is safe.
  }
}

async function rotationCursor(): Promise<number> {
  try {
    const value = await redis.incr(ROTATION_CURSOR_KEY);
    return Math.max(0, value - 1);
  } catch {
    return Math.floor(Date.now() / (15 * 60_000));
  }
}

export interface BackendCycleResult {
  skipped?: string;
  maintenance: Array<{ job: JobName; outcome: "ok" | "error"; error?: string }>;
  preparation: Awaited<ReturnType<typeof runServerlessPreparationCycle>> | null;
  ingestion: { status: string; inserted: number; error?: string } | null;
  elapsedMs: number;
}

/**
 * Runs one bounded cycle. Ordering is deliberate: cheap user-visible jobs,
 * then preparation, then discovery (which is slow and promotes for next time).
 */
export async function runBackendCycle(
  options: {
    lock?: boolean;
    limit?: number;
    scheduleAutomatic?: boolean;
  } = {},
): Promise<BackendCycleResult> {
  const started = Date.now();
  const budgetMs = boundedInteger(
    Number(process.env.BACKEND_CYCLE_BUDGET_MS),
    CYCLE_BUDGET_MS,
    30_000,
    CYCLE_BUDGET_MS,
  );
  const result: BackendCycleResult = {
    maintenance: [],
    preparation: null,
    ingestion: null,
    elapsedMs: 0,
  };

  const releaseLock = options.lock === false ? null : await acquireCycleLock();
  if (!releaseLock && options.lock !== false) {
    result.skipped = "cycle already running";
    result.elapsedMs = Date.now() - started;
    return result;
  }

  try {
    const cursor = await rotationCursor();
    const rotating = Array.from(
      { length: Math.min(ROTATION_SIZE, ROTATING_JOBS.length) },
      (_, index) => ROTATING_JOBS[(cursor + index) % ROTATING_JOBS.length],
    ).filter((job): job is (typeof ROTATING_JOBS)[number] => job !== undefined);

    for (const job of [...CORE_JOBS, ...rotating]) {
      if (Date.now() - started >= budgetMs) break;
      try {
        await runServerlessJob(job.name, {}, job.timeoutMs);
        result.maintenance.push({ job: job.name, outcome: "ok" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.maintenance.push({ job: job.name, outcome: "error", error: message });
        logger.warn(
          { job: job.name, error: message },
          "Scheduled maintenance job failed",
        );
      }
    }

    if (Date.now() - started < budgetMs) {
      result.preparation = await runServerlessPreparationCycle({
        limit: options.limit === undefined
          ? undefined
          : boundedInteger(options.limit, 2, 1, 20),
        scheduleAutomatic: options.scheduleAutomatic,
      });
    }

    // Report and commit the preparation pass before starting discovery. A slow
    // discovery cycle must never hide the user-visible result or leave a
    // queued row waiting for the next 15-minute tick.
    result.elapsedMs = Date.now() - started;
    logger.info({ cycle: result }, "Backend cycle finished");

    if (
      Date.now() - started < budgetMs &&
      result.preparation?.queued === 0 &&
      (await isIngestionDue())
    ) {
      await markIngestionStarted();
      try {
        const ingestion = (await runServerlessJob(
          JOB_NAMES.ingestSources,
          {},
          Math.max(30_000, budgetMs - (Date.now() - started)),
        )) as { status?: string; inserted?: number; error?: string };
        result.ingestion = {
          status: ingestion.status ?? "unknown",
          inserted: ingestion.inserted ?? 0,
          error: ingestion.error,
        };
      } catch (error) {
        result.ingestion = {
          status: "error",
          inserted: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    result.elapsedMs = Date.now() - started;
    const failed = result.maintenance.some((job) => job.outcome === "error") ||
      result.ingestion?.status === "error";
    metric("backend.cycle", 1, { outcome: failed ? "partial" : "success" });
    metric("backend.cycle.duration_ms", result.elapsedMs, {
      outcome: failed ? "partial" : "success",
    });
    logger.info({ cycle: result }, "Backend cycle complete");
    return result;
  } catch (error) {
    result.elapsedMs = Date.now() - started;
    metric("backend.cycle", 1, { outcome: "error" });
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Backend cycle failed",
    );
    throw error;
  } finally {
    if (releaseLock) await releaseLock();
  }
}
