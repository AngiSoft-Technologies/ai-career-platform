import type Redis from "ioredis";
import { logger } from "../logger.js";

/**
 * BullMQ requires Redis to keep every job: `maxmemory-policy noeviction`.
 *
 * Upstash ships `optimistic-volatile`, which silently drops keys — including
 * queued jobs and their locks — once the database reaches its memory limit.
 * The damage is invisible until a job goes missing.
 *
 * Verified against the live database: Upstash does not expose this parameter
 * to clients. `CONFIG GET maxmemory-policy` answers `[]` and
 * `CONFIG SET maxmemory-policy` fails with "Unknown option or number of
 * arguments". The policy therefore cannot be corrected from inside the app —
 * it is a per-database setting in the Upstash console.
 *
 * So this check does what the app *can* do: it fails loudly at boot when the
 * policy is wrong or unreadable, instead of letting jobs vanish silently. The
 * check is advisory, never fatal — Redis is not on the request path, and a
 * managed Redis that refuses `CONFIG` still has to boot.
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
      { required: REQUIRED_POLICY },
      "Redis did not report its eviction policy. Managed providers such as Upstash do not expose CONFIG GET for it — check the eviction setting in the provider console. Jobs are durable only when it is noeviction.",
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
      "Redis is not running noeviction, so queued jobs can be dropped at the memory limit. The provider refused CONFIG SET — change the eviction setting in the Redis provider console.",
    );
  }
}
