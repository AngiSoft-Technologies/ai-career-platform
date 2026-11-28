import { enqueueServerJob } from "../../lib/server-queue.js";
import { usesServerStore } from "../../lib/server-store.js";
import { enqueuePreparationJob } from "../../worker/index.js";

/**
 * One handoff for a queued preparation, whatever host owns the worker.
 *
 * A production server with SQLite+JSONL puts the job in its durable local
 * queue. Vercel (or a Redis-backed deployment) keeps the existing BullMQ path.
 * Callers never branch on the topology themselves.
 */
export async function dispatchPreparation(
  preparationId: string,
  version: number,
  options: { attemptCount?: number; nextAttemptAt?: string } = {},
): Promise<"server" | "bullmq"> {
  const delayMs = options.nextAttemptAt
    ? Math.max(0, new Date(options.nextAttemptAt).getTime() - Date.now())
    : 0;

  if (usesServerStore()) {
    await enqueueServerJob(
      "preparation-drain",
      {
        preparationId,
        version,
        attemptCount: options.attemptCount ?? 0,
      },
      { delayMs, maxAttempts: 2 },
    );
    return "server";
  }

  await enqueuePreparationJob(preparationId, version, {
    attemptCount: options.attemptCount,
    notBefore: options.nextAttemptAt ? new Date(options.nextAttemptAt) : undefined,
  });
  return "bullmq";
}
