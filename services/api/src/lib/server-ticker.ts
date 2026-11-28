/**
 * The production server ticker.
 *
 * This is the always-on half of the backend. It does three things:
 *   1. registers automations in SQLite;
 *   2. turns due automations into durable queue jobs (at most one per interval,
 *      even across replicas, thanks to a lease);
 *   3. runs a file-backed BullMQ replacement worker that drains those jobs.
 *
 * Vercel functions do not run this file. They use request-time `waitUntil` and
 * the schedule fallback instead. The job handlers are shared, so both hosts
 * behave the same way.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import {
  runPreparationServerless,
  runServerlessPreparationCycle,
} from "../services/application/serverless-preparations.js";
import { JOB_NAMES, runJobHandler, type JobName } from "../worker/index.js";
import {
  claimServerTick,
  dueServerAutomations,
  advanceServerAutomation,
  registerServerAutomation,
  releaseServerTick,
  usesServerStore,
  type ServerAutomation,
} from "./server-store.js";
import {
  enqueueServerJob,
  startServerQueueWorker,
  type ServerQueueJob,
  type ServerQueueWorkerHandle,
} from "./server-queue.js";

export interface ServerTickerHandle {
  stop: () => Promise<void>;
}

const JOB_TOPIC_PREFIX = "job:";
const PREPARATION_TOPIC = "preparation-drain";
const AUTOMATION_LEASE = "server:automations:lease";
const AUTOMATION_LEASE_TTL_SECONDS = 55;

function jobTopic(name: JobName): string {
  return `${JOB_TOPIC_PREFIX}${name}`;
}

function isJobName(value: string): value is JobName {
  return (Object.values(JOB_NAMES) as readonly string[]).includes(value);
}

function envInteger(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

const AUTOMATIONS: ReadonlyArray<ServerAutomation> = [
  {
    key: "dispatch-webhooks",
    name: "Dispatch due webhooks",
    topic: jobTopic(JOB_NAMES.dispatchWebhooks),
    payload: {},
    intervalMs: 30_000,
  },
  {
    key: "expire-submission-leases",
    name: "Expire stale submission leases",
    topic: jobTopic(JOB_NAMES.expireApplicationSubmissionLeases),
    payload: {},
    intervalMs: 60_000,
  },
  {
    key: "drain-preparations",
    name: "Drain application preparations",
    topic: PREPARATION_TOPIC,
    payload: {},
    intervalMs: 60_000,
  },
  {
    key: "reconcile-preparations",
    name: "Reconcile automatic preparations",
    topic: jobTopic(JOB_NAMES.reconcileApplicationPreparations),
    payload: {},
    intervalMs: 5 * 60_000,
  },
  {
    key: "saved-search-alerts",
    name: "Evaluate saved search alerts",
    topic: jobTopic(JOB_NAMES.evaluateSavedSearchAlerts),
    payload: {},
    intervalMs: 5 * 60_000,
  },
  {
    key: "calendar-reminders",
    name: "Send calendar reminders",
    topic: jobTopic(JOB_NAMES.sendCalendarReminders),
    payload: {},
    intervalMs: 5 * 60_000,
  },
  {
    key: "reap-stale-rows",
    name: "Reap stale rows",
    topic: jobTopic(JOB_NAMES.reapStaleRows),
    payload: {},
    intervalMs: 10 * 60_000,
  },
  {
    key: "refresh-embeddings",
    name: "Refresh embeddings",
    topic: jobTopic(JOB_NAMES.refreshEmbeddings),
    payload: {},
    intervalMs: 15 * 60_000,
  },
  {
    key: "expire-opportunities",
    name: "Expire opportunities",
    topic: jobTopic(JOB_NAMES.expireOpportunities),
    payload: {},
    intervalMs: 30 * 60_000,
  },
  {
    key: "prune-events",
    name: "Prune old events",
    topic: jobTopic(JOB_NAMES.pruneEvents),
    payload: {},
    intervalMs: 30 * 60_000,
  },
  {
    key: "ingest-sources",
    name: "Discover jobs",
    topic: jobTopic(JOB_NAMES.ingestSources),
    payload: {},
    intervalMs: 30 * 60_000,
  },
];

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

async function handleJob(job: ServerQueueJob): Promise<void> {
  const payload = payloadRecord(job.payload);

  if (job.topic === PREPARATION_TOPIC) {
    const preparationId = typeof payload.preparationId === "string" ? payload.preparationId : null;
    const version = typeof payload.version === "number" ? payload.version : null;
    if (preparationId && version !== null) {
      await runPreparationServerless({
        preparationId,
        version,
        attemptCount: typeof payload.attemptCount === "number" ? payload.attemptCount : 0,
      });
      return;
    }
    await runServerlessPreparationCycle({ limit: 2 });
    return;
  }

  if (!job.topic.startsWith(JOB_TOPIC_PREFIX)) {
    throw new Error(`Unknown server queue topic: ${job.topic}`);
  }
  const name = job.topic.slice(JOB_TOPIC_PREFIX.length);
  if (!isJobName(name)) throw new Error(`Unknown server job: ${name}`);
  await runJobHandler(name, payload);
}

async function scheduleDueAutomations(): Promise<void> {
  const token = `${process.pid}:${randomUUID().slice(0, 8)}`;
  const acquired = await claimServerTick(
    AUTOMATION_LEASE,
    AUTOMATION_LEASE_TTL_SECONDS,
    token,
  );
  if (!acquired) return;

  try {
    const due = await dueServerAutomations();
    for (const automation of due) {
      const bucket = Math.floor(Date.now() / automation.intervalMs);
      await enqueueServerJob(
        automation.topic,
        { ...payloadRecord(automation.payload), scheduledAt: Date.now() },
        { dedupeKey: `${automation.key}:${bucket}`, maxAttempts: 2 },
      );
      await advanceServerAutomation(automation.key);
    }
  } finally {
    await releaseServerTick(AUTOMATION_LEASE, token);
  }
}

/**
 * Starts the production-server clock and worker. Safe to call once per process;
 * a second process can also call it and the SQLite lease prevents duplicate
 * automation dispatch.
 */
export async function startServerTicker(): Promise<ServerTickerHandle | null> {
  if (!usesServerStore()) return null;

  await Promise.all(AUTOMATIONS.map((automation) => registerServerAutomation(automation)));

  const concurrency = envInteger("SERVER_TICKER_CONCURRENCY", 2, 1, 20);
  const pollMs = envInteger("SERVER_TICKER_POLL_MS", 1_000, 100, 30_000);
  const schedulerMs = envInteger("SERVER_TICKER_SCHEDULER_MS", 1_000, 100, 30_000);

  const worker: ServerQueueWorkerHandle = startServerQueueWorker(handleJob, {
    concurrency,
    pollMs,
    lockMs: 25 * 60_000,
    reapAfterMs: 5 * 60_000,
    onError: (error, job) => {
      logger.warn(
        {
          topic: job.topic,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Server queue job failed",
      );
    },
  });

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const schedule = async (): Promise<void> => {
    if (stopped) return;
    try {
      await scheduleDueAutomations();
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Server automation scheduler failed",
      );
    } finally {
      if (!stopped) {
        timer = setTimeout(() => void schedule(), schedulerMs);
        timer.unref?.();
      }
    }
  };
  void schedule();

  logger.info(
    { automations: AUTOMATIONS.length, concurrency, pollMs },
    "Production server ticker started",
  );

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await worker.stop();
    },
  };
}
