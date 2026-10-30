import Redis from "ioredis";
import { config } from "../config.js";
import { logger } from "../logger.js";

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 250, 2_000),
});

let ready = false;

redis.on("ready", () => {
  ready = true;
  logger.info("Redis cache connected");
});

redis.on("error", (error) => {
  ready = false;
  logger.debug({ error: error.message }, "Redis unavailable; cache bypassed");
});

export function startRedis(): void {
  redis.connect().catch((error) => {
    logger.warn({ error: error.message }, "Redis not available at startup");
  });
}

/**
 * Waits for the first connect attempt to settle.
 *
 * Commands issued while the client is still connecting are rejected, because
 * the offline queue is disabled — anything that has to run against Redis at
 * startup goes through here first.
 */
export function waitForRedis(timeoutMs = 5_000): Promise<boolean> {
  if (redis.status === "ready") return Promise.resolve(true);
  return new Promise((resolve) => {
    const settle = (connected: boolean) => {
      clearTimeout(timer);
      redis.off("ready", onReady);
      redis.off("error", onError);
      resolve(connected);
    };
    const onReady = () => settle(true);
    const onError = () => settle(false);
    const timer = setTimeout(() => settle(false), timeoutMs);
    redis.once("ready", onReady);
    redis.once("error", onError);
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!ready) return null;
  try {
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 60,
): Promise<void> {
  if (!ready) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Cache failures must not fail requests.
  }
}

export async function cacheDelByPrefix(prefix: string): Promise<void> {
  if (!ready) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    // Cache failures must not fail requests.
  }
}
