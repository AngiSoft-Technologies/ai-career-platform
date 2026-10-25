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
