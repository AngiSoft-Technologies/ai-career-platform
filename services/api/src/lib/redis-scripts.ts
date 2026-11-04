/**
 * Redis Lua scripts.
 *
 * Everything that has to be atomic against our Redis goes through here:
 *   - `semaphoreAcquire` / `semaphoreHeartbeat` — the lease semaphore
 *   - `quotaReserve` / `quotaRelease` — daily quota with a release handle
 *   - `setIfGreater` — max-wins writes without a lock (out-of-order updates)
 *   - `releaseIfEqual` — compare-and-delete for owned locks
 *
 * Two rules learned the hard way elsewhere:
 *
 *  1. ioredis pipelines **never reject on per-command errors** — they resolve
 *     with `[error, result]` tuples. Any pipeline site must inspect them, or a
 *     failing command is silently dropped.
 *  2. Scripts must tolerate `NOPERM`/`NOAUTH`-style environments where
 *     `SCRIPT LOAD` is unavailable, so every load falls back to inline `EVAL`.
 */

import { redis } from "../db/redis.js";
import { logger } from "../logger.js";

export const REDIS_COMMAND_ARG_CHUNK_SIZE = 16_000;

export type ScriptName =
  | "semaphoreAcquire"
  | "semaphoreHeartbeat"
  | "semaphoreRelease"
  | "quotaReserve"
  | "quotaRelease"
  | "setIfGreater"
  | "releaseIfEqual";

const SCRIPTS: Record<ScriptName, string> = {
  /**
   * Atomic admission: GC expired holders, idempotent re-acquire (a holder
   * that already holds the slot keeps it, refreshed), then admit only when
   * the limit allows. Server TIME is used, never the client clock — clock
   * skew between replicas would otherwise admit over the limit.
   *
   * Returns `[granted, removed, inUse]`.
   */
  semaphoreAcquire: `
    local t = redis.call('TIME')
    local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 1)
    if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
      return {1, 0, redis.call('ZCARD', KEYS[1])}
    end
    local limit = tonumber(ARGV[2])
    if redis.call('ZCARD', KEYS[1]) >= limit then
      return {0, 0, redis.call('ZCARD', KEYS[1])}
    end
    redis.call('ZADD', KEYS[1], 'NX', now + tonumber(ARGV[3]), ARGV[1])
    return {1, 0, redis.call('ZCARD', KEYS[1])}
  `,
  semaphoreHeartbeat: `
    local t = redis.call('TIME')
    local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 1)
    if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
      redis.call('ZADD', KEYS[1], 'XX', 'CH', now + tonumber(ARGV[2]), ARGV[1])
      return 1
    end
    return 0
  `,
  semaphoreRelease: `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[2]) * 1000)
    return redis.call('ZREM', KEYS[1], ARGV[1])
  `,
  /**
   * Daily quota: atomically check the budget and increment, expiring at the
   * next UTC midnight so no sweeper is needed. Returns `[admitted, used]`.
   */
  quotaReserve: `
    local used = tonumber(redis.call('GET', KEYS[1]) or '0')
    local amount = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local projected = used + amount
    if projected > limit then
      return {0, used}
    end
    redis.call('INCRBY', KEYS[1], amount)
    redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[3]))
    return {1, projected}
  `,
  quotaRelease: `
    local used = tonumber(redis.call('GET', KEYS[1]) or '0')
    local amount = tonumber(ARGV[1])
    if used <= amount then
      redis.call('DEL', KEYS[1])
      return 0
    end
    return redis.call('DECRBY', KEYS[1], amount)
  `,
  /**
   * Max-wins write with a TTL refresh in the same call. For values that only
   * move forward (a completion timestamp updated by out-of-order workers),
   * where a plain SET would regress the state.
   */
  setIfGreater: `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    if tonumber(ARGV[1]) > current then
      redis.call('SET', KEYS[1], ARGV[1])
    end
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
    return redis.call('GET', KEYS[1]) or '0'
  `,
  /** Compare-and-delete for a lock we believe we own. */
  releaseIfEqual: `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `,
};

const loadedShas = new Map<ScriptName, string | null>();

export function redisIsReady(): boolean {
  return redis.status === "ready";
}

/** Loads a script's sha (idempotent). Returns `null` when Redis is unreachable. */
export async function ensureScript(name: ScriptName): Promise<string | null> {
  if (loadedShas.has(name)) return loadedShas.get(name) ?? null;
  if (!redisIsReady()) return null;

  try {
    const sha = (await redis.script("LOAD", SCRIPTS[name]!)) as string;
    loadedShas.set(name, sha);
    return sha;
  } catch (error) {
    logger.debug({ error, script: name }, "SCRIPT LOAD failed; will use EVAL");
    loadedShas.set(name, null);
    return null;
  }
}

/**
 * Runs a script. Returns `null` when Redis is unavailable — callers decide
 * whether that means fail-open (allow) or fail-closed (refuse). Never throws
 * for unavailability; throws only for a genuine script error, so a logic bug
 * is loud.
 */
export async function runScript(
  name: ScriptName,
  keys: string[],
  args: (string | number)[],
): Promise<unknown> {
  if (!redisIsReady()) return null;

  const sha = await ensureScript(name);
  const stringArgs = args.map((value) => String(value));

  try {
    if (sha) return await redis.evalsha(sha, keys.length, ...keys, ...stringArgs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("NOSCRIPT")) {
      logger.debug({ error, script: name }, "EVALSHA failed; falling back to EVAL");
    }
  }

  try {
    return await redis.eval(SCRIPTS[name]!, keys.length, ...keys, ...stringArgs);
  } catch (error) {
    if (messageIndicatesUnavailable(error)) {
      logger.debug({ error, script: name }, "Redis unavailable during script run");
      return null;
    }
    throw error;
  }
}

function messageIndicatesUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Connection is closed") ||
    message.includes("Connection is not ready") ||
    message.includes("enableOfflineQueue") ||
    message.includes("ECONNREFUSED") ||
    message.includes("Stream isn't writeable")
  );
}

// ---------------------------------------------------------------------------
// Pipeline hygiene
// ---------------------------------------------------------------------------

/** The first per-command error in a pipeline result, or `null`. */
export function firstPipelineError<T>(
  results: Array<[Error | null, T]>,
): Error | null {
  for (const [error] of results) {
    if (error) return error;
  }
  return null;
}

/** Logs a canonical line when any pipeline command failed. */
export function reportPipelineError(
  context: string,
  results: Array<[Error | null, unknown]>,
): void {
  const error = firstPipelineError(results);
  if (error) {
    logger.warn({ context, error: error.message }, "Redis pipeline command failed");
  }
}

/**
 * Timeout wrapper whose rejection is distinguishable from a Redis error and
 * whose timer never keeps the process alive.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        // A timeout must never be masked by the late rejection; the sentinel
        // has already settled the race, so swallow it.
        void error;
        resolve(TIMED_OUT);
      },
    );
  });
}

export const TIMED_OUT = Symbol("timed_out") as unknown as { readonly timedOut: true };

export function timedOut(value: unknown): boolean {
  return value === TIMED_OUT;
}

/** Resets memoized SHAs. Only for tests and reconnects that lost scripts. */
export function invalidateScriptCache(): void {
  loadedShas.clear();
}
