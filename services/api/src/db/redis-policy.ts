import type Redis from "ioredis";
import { logger } from "../logger.js";

/**
 * BullMQ requires Redis to keep every job: `maxmemory-policy noeviction`.
 *
 * Upstash ships `optimistic-volatile`, which silently drops keys — including
 * queued jobs and their locks — once the database reaches its memory limit.
 * The damage is invisible until a job goes missing, so the policy is
 * corrected at startup rather than trusted to the console.
 *
 * The check is advisory, never fatal: an unreachable or managed Redis that
 * refuses `CONFIG SET` still has to boot, and the worker is not on the request
 * path.
 */
const REQUIRED_POLICY = "noeviction";

export async function ensureRedisQueuePolicy(redis: Redis): Promise<void> {
  const read = async (): Promise<string | null> => {
    const reply = (await redis.call("config", "get", "maxmemory-policy")) as
      | [string, string]
      | string
      | null;
    if (Array.isArray(reply)) return reply[1] ?? null;
    return typeof reply === "string" ? reply : null;
  };

  let policy: string | null = null;
  try {
    policy = await read();
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "Redis eviction policy could not be read",
    );
    return;
  }

  if (policy === REQUIRED_POLICY) return;

  if (policy === null) {
    logger.warn(
      "Redis eviction policy is unknown. Jobs are durable only when it is noeviction.",
    );
    return;
  }

  try {
    await redis.call("config", "set", "maxmemory-policy", REQUIRED_POLICY);
    logger.warn(
      { from: policy, to: REQUIRED_POLICY },
      "Redis eviction policy was corrected for durable job processing",
    );
    return;
  } catch (error) {
    logger.error(
      {
        policy,
        required: REQUIRED_POLICY,
        error: error instanceof Error ? error.message : String(error),
      },
      "Redis eviction policy must be noeviction for jobs to survive memory pressure. Set it in the Redis provider console.",
    );
  }
}
