import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { startDistributedInterval, type TickHandle } from "../lib/distributed-tick.js";
import { clearBacklog, jobPriority, registerBacklog } from "../services/engine/priority.js";
import { runIngestion } from "../services/ingestion/run.js";
import { refreshOpportunityEmbeddings } from "../services/ai/embeddings.js";
import { query } from "../db/pool.js";
import {
  dispatchDueWebhooks,
  reapStuckWebhookDeliveries,
  resumePausedWebhookEndpoints,
} from "../services/webhooks/outbound.js";

export const QUEUE_NAMES = {
  ingestion: "jr-ingestion",
  embeddings: "jr-embeddings",
  maintenance: "jr-maintenance",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  ingestSources: "ingest-sources",
  refreshEmbeddings: "refresh-embeddings",
  expireOpportunities: "expire-opportunities",
  pruneEvents: "prune-events",
  dispatchWebhooks: "dispatch-webhooks",
  reapStaleRows: "reap-stale-rows",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

let connection: IORedis | null = null;
let queues: Map<QueueName, Queue> | null = null;
let workers: Worker[] = [];

export function workerConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    connection.on("error", (error) => {
      logger.debug({ error: error.message }, "Worker Redis error");
    });
  }
  return connection;
}

export function getQueues(): Map<QueueName, Queue> {
  if (!queues) {
    queues = new Map(
      Object.values(QUEUE_NAMES).map(
        (name) =>
          [
            name,
            new Queue(name, {
              connection: workerConnection(),
              defaultJobOptions: DEFAULT_JOB_OPTIONS,
            }),
          ] as const,
      ),
    );
  }
  return queues;
}

export async function enqueue(
  queueName: QueueName,
  jobName: JobName,
  data: Record<string, unknown> = {},
): Promise<string> {
  const queue = getQueues().get(queueName);
  if (!queue) throw new Error(`Unknown queue: ${queueName}`);
  const job = await queue.add(jobName, data, DEFAULT_JOB_OPTIONS);
  return job.id ?? "";
}

async function handleIngest(): Promise<{
  sources: number;
  inserted: number;
  status: string;
  priority: number;
}> {
  // Backlog depth shapes priority: a tenant whose queue is deep is processed
  // later, not refused. Best-effort — Redis absence just means base priority.
  const backlogId = `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await registerBacklog("ingestion", backlogId);
  const priority = await jobPriority("ingestion");
  try {
    const result = await runIngestion();
    return {
      sources: 1,
      inserted: result.inserted,
      status: result.status,
      priority,
    };
  } finally {
    await clearBacklog("ingestion", backlogId);
  }
}

async function handleEmbeddings(): Promise<{
  embedded: number;
  considered: number;
  skipped: boolean;
}> {
  return refreshOpportunityEmbeddings();
}

async function handleExpireOpportunities(): Promise<{ expired: number }> {
  const result = await query(
    `UPDATE opportunities
        SET status = 'expired'
      WHERE status = 'active'
        AND posted_at < now() - interval '60 days'`,
  );
  return { expired: result.rowCount ?? 0 };
}

async function handlePruneEvents(): Promise<{ pruned: number }> {
  const result = await query(
    `DELETE FROM events
      WHERE occurred_at < now() - interval '90 days'`,
  );
  return { pruned: result.rowCount ?? 0 };
}

/**
 * Drains due webhook deliveries.
 *
 * Runs every few seconds rather than on the maintenance cadence: a tenant
 * waiting on an `application.status_changed` notification should not wait
 * hours. Multi-replica safety comes from the delivery claim inside
 * `dispatchDueWebhooks` (`FOR UPDATE SKIP LOCKED`), so this being called by
 * several replicas is expected, not a bug.
 */
async function handleDispatchWebhooks(): Promise<{
  claimed: number;
  delivered: number;
  retryable: number;
  dead: number;
  reaped: number;
}> {
  // Cheap, idempotent housekeeping on the same pass: recover leases stranded
  // by a crashed replica.
  const reaped = await reapStuckWebhookDeliveries();

  const summary = await dispatchDueWebhooks({
    limit: config.WEBHOOK_BATCH_SIZE,
  });
  return { ...summary, reaped };
}

/**
 * Runs the SQL reapers defined in `029_hot_key_indexes_and_reapers.sql`.
 *
 * Kept as one job with a slow cadence because these are maintenance queries:
 * running them on the webhook dispatch tick would churn the tables for no
 * benefit. pg_cron schedules the same functions when the extension is
 * available; this path is what runs today, and both are idempotent.
 */
async function handleReapStaleRows(): Promise<Record<string, number>> {
  const [auth, leases, stuckRuns, deliveries, resumed] = await Promise.all([
    query<{ oauth_states: number; reset_tokens: number; refresh_tokens: number }>(
      `SELECT * FROM reap_expired_auth_artifacts()`,
    ),
    query<{ reap_webhook_leases: number }>(`SELECT reap_webhook_leases()`),
    query<{ reap_stuck_discovery_runs: number }>(
      `SELECT reap_stuck_discovery_runs()`,
    ),
    query<{ reap_webhook_deliveries: number }>(
      `SELECT reap_webhook_deliveries()`,
    ),
    // Endpoints paused by the circuit breaker come back once their cooldown
    // elapsed: pausing is not unsubscribing.
    resumePausedWebhookEndpoints(),
  ]);

  return {
    oauthStates: auth.rows[0]?.oauth_states ?? 0,
    resetTokens: auth.rows[0]?.reset_tokens ?? 0,
    refreshTokens: auth.rows[0]?.refresh_tokens ?? 0,
    webhookLeases: leases.rows[0]?.reap_webhook_leases ?? 0,
    stuckDiscoveryRuns: stuckRuns.rows[0]?.reap_stuck_discovery_runs ?? 0,
    // Column name mirrors the function: Postgres names a returned scalar
    // after the function itself, so this is not a typo.
    webhookDeliveries: deliveries.rows[0]?.reap_webhook_deliveries ?? 0,
    endpointsResumed: resumed,
  };
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 4).join(" | "),
      code: (error as { code?: string }).code,
    };
  }
  return { name: "Unknown", message: String(error) };
}

/**
 * How long a single job may run before it is failed.
 *
 * A worker slot is the scarcest resource in the queue: a job that never
 * settles holds its slot for ever, the queue stops draining, and nothing
 * reports an error anywhere. Every handler here does network and database
 * work, so every handler gets a deadline. The work cannot be cancelled, but
 * the slot is released — a stuck job must not be able to take the pipeline
 * down with it.
 */
const JOB_TIMEOUTS: Record<JobName, number> = {
  [JOB_NAMES.ingestSources]: 20 * 60_000,
  [JOB_NAMES.refreshEmbeddings]: 10 * 60_000,
  [JOB_NAMES.expireOpportunities]: 5 * 60_000,
  [JOB_NAMES.pruneEvents]: 5 * 60_000,
  [JOB_NAMES.dispatchWebhooks]: 2 * 60_000,
  [JOB_NAMES.reapStaleRows]: 5 * 60_000,
};

class JobTimeoutError extends Error {
  constructor(
    readonly job: string,
    readonly timeoutMs: number,
  ) {
    super(`JOB_TIMEOUT: ${job} exceeded ${timeoutMs}ms`);
    this.name = "JobTimeoutError";
  }
}

/** Runs `work` under a deadline, warning while it is still running. */
export function withJobDeadline<T>(
  jobName: JobName,
  work: () => Promise<T>,
  timeoutMs?: number,
): Promise<T> {
  const limitMs =
    timeoutMs ??
    JOB_TIMEOUTS[jobName] ??
    Number(process.env.WORKER_JOB_TIMEOUT_MS ?? 10 * 60_000);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new JobTimeoutError(jobName, limitMs));
    }, limitMs);
    // Deliberately *not* unref'd: the deadline is the reason this process
    // must stay alive. An unref'd timer does not fire when nothing else
    // keeps the event loop busy, which is exactly the case a stuck job
    // creates — the deadline would never arrive.

    // A job that is still running halfway to its deadline is worth knowing
    // about before it fails.
    const warnTimer = setTimeout(() => {
      logger.warn(
        { job: jobName, timeoutMs: limitMs },
        "Background job is still running past half its deadline",
      );
    }, Math.floor(limitMs / 2));
    warnTimer.unref?.();

    work().then(
      (value) => {
        clearTimeout(timer);
        clearTimeout(warnTimer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        clearTimeout(warnTimer);
        reject(error);
      },
    );
  });
}

const handlers: Record<JobName, () => Promise<unknown>> = {
  [JOB_NAMES.ingestSources]: handleIngest,
  [JOB_NAMES.refreshEmbeddings]: handleEmbeddings,
  [JOB_NAMES.expireOpportunities]: handleExpireOpportunities,
  [JOB_NAMES.pruneEvents]: handlePruneEvents,
  [JOB_NAMES.dispatchWebhooks]: handleDispatchWebhooks,
  [JOB_NAMES.reapStaleRows]: handleReapStaleRows,
};

/** Last time a job finished on each queue, for the stall watchdog. */
const lastCompletion = new Map<string, number>();

/**
 * Watches for a queue that has stopped making progress.
 *
 * The failure this exists to catch is completely silent: a job that never
 * settles holds its worker slot, the queue stops draining, and the periodic
 * tick keeps adding jobs to a backlog nobody drains. Nothing throws, so
 * nothing alerts — the only symptom is a queue depth that grows and a
 * pipeline that quietly stops.
 */
function startStallWatchdog(queueMap: Map<QueueName, Queue>): () => void {
  const thresholdMs = Number(
    process.env.WORKER_STALL_THRESHOLD_MS ?? 10 * 60_000,
  );
  const checkEveryMs = Number(process.env.WORKER_STALL_CHECK_MS ?? 60_000);

  const timer = setInterval(() => {
    void (async () => {
      for (const [queueName, queue] of queueMap) {
        try {
          const active = await withDeadline(
            queue.getActiveCount(),
            5_000,
            `active-count:${queueName}`,
          );
          if (typeof active !== "number" || active === 0) continue;
          const stalledMs = Date.now() - (lastCompletion.get(queueName) ?? Date.now());
          if (stalledMs > thresholdMs) {
            logger.error(
              { queue: queueName, active, stalledMs, thresholdMs },
              "Queue is not draining: jobs are stuck and the slots are held",
            );
          }
        } catch {
          // The watchdog must never be the thing that breaks.
        }
      }
    })();
  }, checkEveryMs);
  timer.unref?.();

  return () => clearInterval(timer);
}

export interface WorkerHandle {
  queues: Map<QueueName, Queue>;
  stop: () => Promise<void>;
}

/**
 * Starts every background consumer inside the API process. The backend is a
 * single deployable: `fly deploy` boots HTTP, GraphQL, MCP, SSE, WebSocket,
 * gRPC and the background workers together. Nothing has to be started by hand.
 */
export async function startWorkers(): Promise<WorkerHandle> {
  const queueMap = getQueues();

  for (const [queueName, queue] of queueMap) {
    const worker = new Worker(
      queueName,
      async (job) => {
        const handler = handlers[job.name as JobName];
        if (!handler) {
          throw new Error(`Unknown job: ${job.name}`);
        }
        const startedAt = Date.now();
        try {
          const result = await withJobDeadline(job.name as JobName, handler);
          lastCompletion.set(queueName, Date.now());
          logger.info(
            { queue: queueName, job: job.name, durationMs: Date.now() - startedAt },
            "Background job completed",
          );
          return result;
        } catch (error) {
          lastCompletion.set(queueName, Date.now());
          logger.error(
            {
              queue: queueName,
              job: job.name,
              durationMs: Date.now() - startedAt,
              error: describeError(error),
            },
            "Background job failed",
          );
          throw error;
        }
      },
      {
        connection: workerConnection(),
        concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
      },
    );

    worker.on("failed", (job, error) => {
      logger.error(
        { job: job?.name, error: describeError(error) },
        "Background job attempt failed",
      );
    });

    workers.push(worker);
    logger.info({ queue: queueName }, "Background consumer started");
  }

  await scheduleRecurringJobs(queueMap);

  const stopWatchdog = startStallWatchdog(queueMap);

  return {
    queues: queueMap,
    stop: async () => {
      stopWatchdog();
      await Promise.all(workers.map((worker) => worker.close()));
      workers = [];
      await Promise.all(
        [...queueMap.values()].map((queue) => queue.close()),
      );
      if (connection) {
        await connection.quit();
        connection = null;
      }
    },
  };
}

/**
 * Runs a single ingestion cycle and returns results.
 * Call this directly from a continuous polling loop instead of using a scheduler.
 */
async function runIngestionCycle(): Promise<{
  sources: number;
  inserted: number;
  status: string;
}> {
  const result = await runIngestion();
  return {
    sources: 1,
    inserted: result.inserted,
    status: result.status,
  };
}

/**
 * Starts a continuous polling loop for the given queue.
 * The callback will be invoked every `intervalMs` milliseconds until `stop()` is called.
 */
/**
 * Continuous polling, gated by a distributed tick.
 *
 * A raw `setInterval` has a specific failure mode on a multi-replica deploy:
 * every replica fires the same timer and enqueues the same job N times, so a
 * 30s cadence becomes ~7s under load with duplicate work. The tick is claimed
 * with a Redis lease, so exactly one replica enqueues per interval; when
 * Redis is unreachable we fall back to running locally in development rather
 * than silently never running.
 *
 * The enqueue is **deduplicated by job id**. A periodic job means "make sure
 * this runs", not "add another one every interval": the ingestion cycle
 * takes minutes, so adding one every 30s grew a backlog that the workers
 * could never drain. With a fixed job id, BullMQ keeps at most one copy
 * pending, and the next tick picks up as soon as the previous run finishes.
 */
function startContinuousPolling(
  queue: Queue,
  jobName: JobName,
  intervalMs: number,
): { stop: () => Promise<void> } {
  const tickName = `tick:{${queue.name}}:${jobName}`;
  let tick: TickHandle | null = null;

  const stop = async (): Promise<void> => {
    tick?.stop();
    tick = null;
  };

  tick = startDistributedInterval(
    tickName,
    intervalMs,
    async () => {
      try {
        // The worker's Redis connection retries forever (BullMQ requires
        // it), so an unreachable Redis leaves this call pending for ever.
        // A deadline turns that into a failed tick, which the next tick
        // retries.
        await withDeadline(
          queue.add(
            jobName,
            {},
            {
              attempts: 1,
              jobId: `periodic:${jobName}`,
              // Removed on completion so the id frees up for the next run;
              // kept on failure would block every later tick.
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
          10_000,
          `enqueue:${jobName}`,
        );
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          "Failed to add continuous polling job",
        );
      }
    },
    {
      label: `${queue.name}:${jobName}`,
      runWhenRedisDown: config.NODE_ENV !== "production",
    },
  );

  return { stop };
}

/** A promise that gives up after `ms`, so a hung call cannot wedge a loop. */
function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`DEADLINE_EXCEEDED: ${label} exceeded ${ms}ms`));
    }, ms);
    // Not unref'd: the deadline must arrive even when the work it is
    // waiting on is the only thing keeping the loop busy.
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function scheduleRecurringJobs(
  queueMap: Map<QueueName, Queue>,
): Promise<void> {
  const ingestionIntervalMs = Number(
    process.env.INGESTION_INTERVAL_MS ?? 30_000,
  );
  const embeddingIntervalMs = Number(
    process.env.EMBEDDING_INTERVAL_MS ?? 60_000,
  );
  const maintenanceIntervalMs = Number(
    process.env.MAINTENANCE_INTERVAL_MS ?? 6_000,
  );
  const pruningIntervalMs = Number(
    process.env.PRUNING_INTERVAL_MS ?? 24_000,
  );
  const pruningHours = Number(process.env.PRUNING_INTERVAL_HOURS ?? 6);

  const ingestionQueue = queueMap.get(QUEUE_NAMES.ingestion);
  const embeddingQueue = queueMap.get(QUEUE_NAMES.embeddings);
  const maintenanceQueue = queueMap.get(QUEUE_NAMES.maintenance);

  /**
   * Removes a repeatable scheduler left behind by an earlier configuration.
   *
   * A job scheduler lives in Redis until it is removed, so switching a
   * queue from scheduler mode to continuous mode leaves the old scheduler
   * running: it keeps adding jobs on its own cadence, forever, in addition
   * to the continuous tick. The duplicate source is invisible — it shows up
   * only as a queue that never drains.
   */
  const removeStaleScheduler = async (
    queue: Queue | undefined,
    schedulerId: string,
  ): Promise<void> => {
    if (!queue) return;
    try {
      const removed = await withDeadline(
        queue.removeJobScheduler(schedulerId),
        10_000,
        `remove-scheduler:${schedulerId}`,
      );
      if (removed) {
        logger.info({ scheduler: schedulerId }, "Removed a stale job scheduler");
      }
    } catch (error) {
      logger.warn(
        { error, scheduler: schedulerId },
        "Could not remove a stale job scheduler",
      );
    }
  };

  // Set up continuous polling for ingestion if enabled
  if (ingestionQueue && process.env.CONTINUOUS_INGESTION !== "false") {
    await removeStaleScheduler(ingestionQueue, "scheduler-ingestion");
    await startContinuousPolling(
      ingestionQueue,
      JOB_NAMES.ingestSources,
      ingestionIntervalMs,
    );
    logger.info(
      { intervalMs: ingestionIntervalMs },
      "Continuous ingestion polling started",
    );
  } else if (ingestionQueue) {
    // Fall back to scheduler if continuous is disabled
    const ingestionMinutes = Number(
      process.env.INGESTION_INTERVAL_MINUTES ?? 30,
    );
    await ingestionQueue.upsertJobScheduler(
      "scheduler-ingestion",
      { every: ingestionMinutes * 60_000, startDate: new Date(Date.now() + 60_000) },
      { name: JOB_NAMES.ingestSources, data: {} },
    );
    logger.info(
      { intervalMinutes: ingestionMinutes },
      "Scheduled ingestion job set up",
    );
  }

  // Set up continuous polling for embeddings if enabled
  if (embeddingQueue && process.env.CONTINUOUS_EMBEDDING !== "false") {
    await removeStaleScheduler(embeddingQueue, "scheduler-embeddings");
    await startContinuousPolling(
      embeddingQueue,
      JOB_NAMES.refreshEmbeddings,
      embeddingIntervalMs,
    );
    logger.info(
      { intervalMs: embeddingIntervalMs },
      "Continuous embedding polling started",
    );
  } else if (embeddingQueue) {
    const embeddingMinutes = Number(
      process.env.EMBEDDING_INTERVAL_MINUTES ?? 60,
    );
    await embeddingQueue.upsertJobScheduler(
      "scheduler-embeddings",
      { every: embeddingMinutes * 60_000, startDate: new Date(Date.now() + 120_000) },
      { name: JOB_NAMES.refreshEmbeddings, data: {} },
    );
    logger.info(
      { intervalMinutes: embeddingMinutes },
      "Scheduled embedding job set up",
    );
  }

  if (maintenanceQueue) {
    if (process.env.CONTINUOUS_MAINTENANCE !== "false") {
      await removeStaleScheduler(maintenanceQueue, "scheduler-maintenance");
      await removeStaleScheduler(maintenanceQueue, "scheduler-event-pruning");
      await startContinuousPolling(
        maintenanceQueue,
        JOB_NAMES.expireOpportunities,
        maintenanceIntervalMs,
      );
      logger.info(
        { intervalMs: maintenanceIntervalMs },
        "Continuous maintenance polling started",
      );

      // Event pruning used to run only through the repeatable scheduler. In
      // continuous mode it has to be polled too, or pruning stops the
      // moment the stale scheduler is removed.
      await startContinuousPolling(
        maintenanceQueue,
        JOB_NAMES.pruneEvents,
        pruningIntervalMs,
      );
      logger.info(
        { intervalMs: pruningIntervalMs },
        "Continuous event pruning started",
      );
    } else {      const maintenanceHours = Number(
        process.env.MAINTENANCE_INTERVAL_HOURS ?? 6,
      );
      await maintenanceQueue.upsertJobScheduler(
        "scheduler-maintenance",
        { every: maintenanceHours * 3_600_000, startDate: new Date(Date.now() + 180_000) },
        { name: JOB_NAMES.expireOpportunities, data: {} },
      );
      logger.info(
        { intervalHours: maintenanceHours },
        "Scheduled maintenance job set up",
      );

      await maintenanceQueue.upsertJobScheduler(
        "scheduler-event-pruning",
        { every: pruningHours * 3_600_000, startDate: new Date(Date.now() + 240_000) },
        { name: JOB_NAMES.pruneEvents, data: {} },
      );
      logger.info(
        { intervalHours: pruningHours },
        "Scheduled event pruning job set up",
      );
    }
  }

  // Webhook delivery runs on its own short cadence: a tenant waiting on an
  // `application.status_changed` notification must not wait for the hourly
  // maintenance pass. An idle queue costs one indexed query per tick, and the
  // claim inside the handler makes several replicas safe by construction.
  if (maintenanceQueue && process.env.CONTINUOUS_WEBHOOKS !== "false") {
    const webhookIntervalMs = Number(
      process.env.WEBHOOK_DISPATCH_INTERVAL_MS ?? 5_000,
    );
    await startContinuousPolling(
      maintenanceQueue,
      JOB_NAMES.dispatchWebhooks,
      webhookIntervalMs,
    );
    logger.info(
      { intervalMs: webhookIntervalMs },
      "Continuous webhook dispatch started",
    );
  }

  if (maintenanceQueue && process.env.CONTINUOUS_REAPERS !== "false") {
    const reaperIntervalMs = Number(
      process.env.REAPER_INTERVAL_MS ?? 3_600_000,
    );
    await startContinuousPolling(
      maintenanceQueue,
      JOB_NAMES.reapStaleRows,
      reaperIntervalMs,
    );
    logger.info(
      { intervalMs: reaperIntervalMs },
      "Continuous stale-row reaping started",
    );
  }

  logger.info(
    {
      ingestionIntervalMs,
      embeddingIntervalMs,
      maintenanceIntervalMs,
      pruningIntervalMs,
      continuousIngestion: process.env.CONTINUOUS_INGESTION !== "false",
      continuousEmbedding: process.env.CONTINUOUS_EMBEDDING !== "false",
      continuousMaintenance: process.env.CONTINUOUS_MAINTENANCE !== "false",
    },
    "Recurring background jobs configured",
  );
}
