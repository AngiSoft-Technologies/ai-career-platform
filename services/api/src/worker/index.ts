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

const handlers: Record<JobName, () => Promise<unknown>> = {
  [JOB_NAMES.ingestSources]: handleIngest,
  [JOB_NAMES.refreshEmbeddings]: handleEmbeddings,
  [JOB_NAMES.expireOpportunities]: handleExpireOpportunities,
  [JOB_NAMES.pruneEvents]: handlePruneEvents,
  [JOB_NAMES.dispatchWebhooks]: handleDispatchWebhooks,
  [JOB_NAMES.reapStaleRows]: handleReapStaleRows,
};

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
          const result = await handler();
          logger.info(
            { queue: queueName, job: job.name, durationMs: Date.now() - startedAt },
            "Background job completed",
          );
          return result;
        } catch (error) {
          logger.error(
            {
              queue: queueName,
              job: job.name,
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

  return {
    queues: queueMap,
    stop: async () => {
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
        await queue.add(jobName, {}, { attempts: 1 });
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

  // Set up continuous polling for ingestion if enabled
  if (ingestionQueue && process.env.CONTINUOUS_INGESTION !== "false") {
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
      await startContinuousPolling(
        maintenanceQueue,
        JOB_NAMES.expireOpportunities,
        maintenanceIntervalMs,
      );
      logger.info(
        { intervalMs: maintenanceIntervalMs },
        "Continuous maintenance polling started",
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
