import {
  cacheDelByPrefix as redisCacheDelByPrefix,
  cacheGet as redisCacheGet,
  cacheSet as redisCacheSet,
} from "../db/redis.js";
import {
  serverCacheDelByPrefix,
  serverCacheGet,
  serverCacheSet,
  usesServerStore,
} from "./server-store.js";

/**
 * Cache adapter. A persistent production backend uses SQLite; Vercel and
 * Redis-backed deployments keep the existing Redis cache. Callers do not need
 * to know which host is serving them.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (usesServerStore()) return serverCacheGet<T>(key);
  return redisCacheGet<T>(key);
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 60,
): Promise<void> {
  if (usesServerStore()) {
    await serverCacheSet(key, value, ttlSeconds * 1_000);
    return;
  }
  await redisCacheSet(key, value, ttlSeconds);
}

export async function cacheDelByPrefix(prefix: string): Promise<void> {
  if (usesServerStore()) {
    await serverCacheDelByPrefix(prefix);
    return;
  }
  await redisCacheDelByPrefix(prefix);
}
