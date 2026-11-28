import { redis } from "../../db/redis.js";
import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import {
  PreparationAlreadyRunningError,
  recoverStalePreparations,
  runPreparation,
} from "./preparation.js";
import {
  listQueuedPreparations,
  scheduleAutomaticPreparations,
  type QueuedPreparation,
} from "./scheduler.js";

/**
 * Serverless preparation execution.
 *
 * This is the direct execution path for the shared `runPreparation` pipeline.
 * On Vercel there is no long-lived BullMQ consumer, so a QUEUED row would stay
 * QUEUED: adding a job without a consumer changes nothing. The request that
 * creates the work runs it through `waitUntil`, and a schedule drains anything
 * left behind. A persistent production server uses the same function from its
 * SQLite queue worker, so both hosts execute identical preparation logic.
 *
 * Both entry points share a short Redis lease per preparation version. The
 * database claim in `runPreparation` remains the real lock; the lease stops a
 * second invocation from even starting expensive AI work for the same row.
 */

const RUN_LEASE_PREFIX = "preparation:serverless-run:";
const RUN_LEASE_TTL_SECONDS = 270; // inside the 300s Vercel function deadline
const STALE_RUN_TIMEOUT_MS = 8 * 60_000;
const DRAIN_BUDGET_MS = 240_000;

type PreparationOutcome = "ran" | "skipped" | "failed";

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function attemptLimit(): number {
  return boundedInteger(
    Number(process.env.APPLICATION_PREPARATION_MAX_ATTEMPTS ?? 3),
    3,
    1,
    10,
  );
}

/** Runs one queued preparation now, without depending on a BullMQ consumer. */
export async function runPreparationServerless(
  preparation: Pick<QueuedPreparation, "preparationId" | "version" | "attemptCount">,
): Promise<PreparationOutcome> {
  const limit = attemptLimit();
  if (preparation.attemptCount >= limit) return "skipped";

  const leaseKey = `${RUN_LEASE_PREFIX}${preparation.preparationId}:${preparation.version}`;
  let releaseLease = false;
  try {
    releaseLease =
      (await redis.set(leaseKey, "1", "EX", RUN_LEASE_TTL_SECONDS, "NX")) === "OK";
  } catch {
    // Redis is a coordination optimisation here. The database claim in
    // runPreparation is authoritative, so never block preparation on Redis.
    releaseLease = true;
  }
  if (!releaseLease) return "skipped";

  try {
    const result = await runPreparation(preparation.preparationId, {
      expectedVersion: preparation.version,
      attemptLimit: limit,
      finalAttempt: preparation.attemptCount + 1 >= limit,
      attemptNumber: preparation.attemptCount + 1,
      retryAttempt: preparation.attemptCount + 1,
    });
    return result ? "ran" : "skipped";
  } catch (error) {
    if (error instanceof PreparationAlreadyRunningError) return "skipped";
    // runPreparation has already persisted the failed attempt and its retry
    // state. One failed row must not stop the rest of the drain.
    logger.warn(
      {
        preparationId: preparation.preparationId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Serverless preparation attempt failed",
    );
    return "failed";
  } finally {
    if (releaseLease) await redis.del(leaseKey).catch(() => undefined);
  }
}

export interface ServerlessPreparationCycleResult {
  recovered: number;
  scheduled: number;
  queued: number;
  ran: number;
  skipped: number;
  failed: number;
  elapsedMs: number;
}

/**
 * One scheduler pass: recover interrupted runs, create automatic work, then
 * execute a bounded page of due preparations in this function.
 */
export async function runServerlessPreparationCycle(
  options: { limit?: number; scheduleAutomatic?: boolean } = {},
): Promise<ServerlessPreparationCycleResult> {
  const started = Date.now();
  const limit = boundedInteger(
    options.limit ?? Number(process.env.SERVERLESS_PREPARATION_BATCH_SIZE ?? 2),
    2,
    1,
    20,
  );

  const recovered = await recoverStalePreparations({
    timeoutMs: STALE_RUN_TIMEOUT_MS,
    limit: 10,
  });

  // A scheduler that adds a fresh batch on every pass keeps an old backlog at
  // a permanent equilibrium. Gate new automatic work on the due backlog being
  // smaller than one drain batch, so queued candidates actually get prepared.
  let scheduleNewWork = options.scheduleAutomatic !== false;
  if (scheduleNewWork) {
    try {
      const backlog = await query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM application_preparations
          WHERE status = 'QUEUED'
            AND attempt_count < $1
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())`,
        [attemptLimit()],
      );
      // Newly created rows have a NULL next_attempt_at. Any non-zero due
      // backlog must be drained first or fresh work perpetually jumps ahead
      // of it in the queue.
      scheduleNewWork = Number(backlog.rows[0]?.count ?? 0) === 0;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Could not read preparation backlog; scheduling new work",
      );
    }
  }
  const scheduled = scheduleNewWork
    ? await scheduleAutomaticPreparations()
    : [];
  const queued = await listQueuedPreparations({
    limit,
    leaseMs: 90_000,
  });

  const result: ServerlessPreparationCycleResult = {
    recovered: recovered.length,
    scheduled: scheduled.length,
    queued: queued.length,
    ran: 0,
    skipped: 0,
    failed: 0,
    elapsedMs: 0,
  };

  // A bounded pool drains several candidates inside one function invocation.
  // Each row still has its own database claim and Redis lease, so concurrency
  // never lets two invocations work on the same preparation.
  const concurrency = boundedInteger(
    Number(process.env.SERVERLESS_PREPARATION_CONCURRENCY ?? 3),
    3,
    1,
    5,
  );
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < queued.length) {
      // Leave time for the final commit. Anything not started stays QUEUED and
      // is picked up by the next pass.
      if (Date.now() - started > DRAIN_BUDGET_MS) return;
      const preparation = queued[cursor];
      cursor += 1;
      if (!preparation) continue;
      result[await runPreparationServerless(preparation)] += 1;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queued.length) }, () => worker()),
  );

  result.elapsedMs = Date.now() - started;
  return result;
}
