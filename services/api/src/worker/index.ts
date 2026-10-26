import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { runIngestion } from "../services/ingestion/run.js";
import { refreshOpportunityEmbeddings } from "../services/ai/embeddings.js";
import { query } from "../db/pool.js";

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

async function handleIngest(): Promise<{ sources: number; inserted: number }> {
  const stats = await runIngestion();
  return {
    sources: stats.length,
    inserted: stats.reduce((sum, entry) => sum + entry.inserted, 0),
  };
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

async function scheduleRecurringJobs(
  queueMap: Map<QueueName, Queue>,
): Promise<void> {
  const ingestionMinutes = Number(process.env.INGESTION_INTERVAL_MINUTES ?? 30);
  const embeddingMinutes = Number(process.env.EMBEDDING_INTERVAL_MINUTES ?? 60);
  const maintenanceHours = Number(process.env.MAINTENANCE_INTERVAL_HOURS ?? 6);
  const pruningHours = Number(process.env.PRUNING_INTERVAL_HOURS ?? 24);

  const ingestionQueue = queueMap.get(QUEUE_NAMES.ingestion);
  const embeddingQueue = queueMap.get(QUEUE_NAMES.embeddings);
  const maintenanceQueue = queueMap.get(QUEUE_NAMES.maintenance);

  if (ingestionQueue) {
    await ingestionQueue.upsertJobScheduler(
      "scheduler-ingestion",
      { every: ingestionMinutes * 60_000, startDate: new Date(Date.now() + 60_000) },
      { name: JOB_NAMES.ingestSources, data: {} },
    );
  }

  if (embeddingQueue) {
    await embeddingQueue.upsertJobScheduler(
      "scheduler-embeddings",
      { every: embeddingMinutes * 60_000, startDate: new Date(Date.now() + 120_000) },
      { name: JOB_NAMES.refreshEmbeddings, data: {} },
    );
  }

  if (maintenanceQueue) {
    await maintenanceQueue.upsertJobScheduler(
      "scheduler-maintenance",
      { every: maintenanceHours * 3_600_000, startDate: new Date(Date.now() + 180_000) },
      { name: JOB_NAMES.expireOpportunities, data: {} },
    );
    await maintenanceQueue.upsertJobScheduler(
      "scheduler-event-pruning",
      { every: pruningHours * 3_600_000, startDate: new Date(Date.now() + 240_000) },
      { name: JOB_NAMES.pruneEvents, data: {} },
    );
  }

  logger.info(
    {
      ingestionMinutes,
      embeddingMinutes,
      maintenanceHours,
      pruningHours,
    },
    "Recurring background jobs scheduled",
  );
}
