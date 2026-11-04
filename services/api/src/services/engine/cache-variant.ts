/**
 * Variant-keyed cache with exact/range dimension split.
 *
 * The idea that makes this correct rather than merely fast:
 *
 *  - **Exact-match dimensions go in the key.** A mobile, ad-blocked, stealth
 *    or geo-located fetch must never be served a plain desktop hit, so those
 *    dimensions hash into the key.
 *  - **Range dimensions go in the payload and are filtered client-side.**
 *    Age windows, screenshot availability and wait-time are properties of an
 *    entry, not of the question, so they can be re-evaluated per request
 *    without fragmenting the key space.
 *  - **Negative caching is a time-window proof, not a TTL.** A marker records
 *    "as of this write, no entry existed in `[t - maxAge, t]`". A later lookup
 *    for `[now - maxAge, now]` is provably empty iff its left edge is not
 *    earlier than the marker — and a *positive write deletes the marker*, which
 *    covers the tail. A blind TTL would answer neither question.
 *
 * Every operation returns a **status** (`hit | miss | error`) rather than
 * throwing; callers fall back to the source of truth.
 */

import { createHash } from "node:crypto";
import { redis } from "../../db/redis.js";
import { logger } from "../../logger.js";
import {
  redisIsReady,
  runScript,
  timedOut,
  TIMED_OUT,
  withTimeout,
} from "../../lib/redis-scripts.js";

export type CacheStatus = "hit" | "miss" | "error";

/** Dimensions that select *which* entry is valid. Hashed into the key. */
export interface VariantDimensions {
  urlHash: string;
  isMobile?: boolean;
  blockAds?: boolean;
  isStealth?: boolean;
  locationCountry?: string | null;
  /** Deliberately keeps `[]` and `null` distinct, mirroring SQL set-vs-null. */
  locationLanguages?: string[] | null;
}

/** Dimensions that describe *when* an entry is acceptable. Filtered per read. */
export interface RangeFilters {
  /** Reject entries younger than this (freshness experiments). */
  minAgeMs?: number;
  /** Reject entries older than this. Defaults to the entry TTL. */
  maxAgeMs?: number;
  /** Reject entries without a screenshot sidecar. */
  requireScreenshot?: boolean;
}

export interface VariantCacheOptions {
  /** Entry TTL. Hygiene, not correctness: eviction happens under pressure. */
  entryTtlSeconds: number;
  /** Entries per variant key before oldest-first eviction. */
  entryCap?: number;
  /** Windowed negative caching. 0 disables. */
  negativeTtlMs?: number;
  /** Redis availability budget for one operation. */
  timeoutMs?: number;
}

interface CacheEnvelope<T> {
  createdAt: number;
  hasScreenshot?: boolean;
  value: T;
}

export type CacheReadResult<T> =
  | { status: "hit"; value: T; ageMs: number }
  /**
   * A negative marker proved that no entry existed over the window. This is
   * different from a plain miss: the caller may *skip* the source entirely
   * for the length of the window instead of asking again.
   */
  | { status: "negative" }
  | { status: "miss" }
  | { status: "error" };

/** Deterministic hash over the exact-match dimensions, in a fixed order. */
export function deriveVariantKey(dimensions: VariantDimensions): string {
  const canonical = JSON.stringify([
    dimensions.urlHash,
    dimensions.isMobile ?? false,
    dimensions.blockAds ?? true,
    dimensions.isStealth ?? false,
    dimensions.locationCountry ?? null,
    // Sorted + deduped so language order never fragments the key space.
    dimensions.locationLanguages
      ? [...new Set(dimensions.locationLanguages)].sort()
      : null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * A negative marker recorded at `emptyFrom` proves emptiness for the window
 * `[emptyFrom - maxAgeMs, emptyFrom]`. A lookup for `[now - maxAgeMs, now]`
 * is covered iff its left edge is no earlier than that.
 *
 * `maxAgeMs` is the **entry** age limit, not the marker's lifetime. The
 * proof is "nothing existed at `emptyFrom`, and nothing has been written
 * since (a write deletes the marker)", so every possible entry is older than
 * `emptyFrom` and is stale exactly when `now - maxAgeMs >= emptyFrom`.
 */
export function isNegativeStillValid(
  emptyFrom: number,
  maxAgeMs: number,
  now: number,
): boolean {
  return now - maxAgeMs >= emptyFrom;
}

export class VariantCache<T> {
  private readonly keyPrefix: string;
  private readonly negativePrefix: string;
  private readonly entryCap: number;
  private readonly negativeTtlMs: number;
  private readonly timeoutMs: number;
  private readonly entryTtlMs: number;

  private readonly counters = {
    read: 0,
    hit: 0,
    miss: 0,
    error: 0,
    write: 0,
    writeFailed: 0,
    negativeHit: 0,
    readTimeout: 0,
  };

  constructor(
    name: string,
    private readonly options: VariantCacheOptions,
  ) {
    this.keyPrefix = `${name}:v:`;
    this.negativePrefix = `${name}:neg:`;
    this.entryCap = options.entryCap ?? 32;
    this.negativeTtlMs = options.negativeTtlMs ?? 0;
    this.timeoutMs = options.timeoutMs ?? 250;
    this.entryTtlMs = options.entryTtlSeconds * 1_000;
  }

  private readKey(variantKey: string): string {
    return `${this.keyPrefix}${variantKey}`;
  }

  private negativeKey(variantKey: string): string {
    return `${this.negativePrefix}${variantKey}`;
  }

  async read(
    dimensions: VariantDimensions,
    filters: RangeFilters = {},
  ): Promise<CacheReadResult<T>> {
    if (!redisIsReady()) return { status: "error" };
    this.counters.read += 1;

    const variantKey = deriveVariantKey(dimensions);
    const maxAgeMs = filters.maxAgeMs ?? this.entryTtlMs;

    try {
      const raw = await withTimeout(
        redis.hget(this.readKey(variantKey), variantKey),
        this.timeoutMs,
      );
      if (timedOut(raw)) {
        this.counters.readTimeout += 1;
        return { status: "error" };
      }
      if (typeof raw === "string") {
        const entry = this.parseEnvelope(raw);
        if (!entry) {
          // Corrupt entry: skip it and let the write path replace it.
          await this.delete(dimensions);
          return { status: "miss" };
        }
        const ageMs = Date.now() - entry.createdAt;
        if (ageMs > maxAgeMs) return { status: "miss" };
        if (filters.minAgeMs !== undefined && ageMs < filters.minAgeMs) {
          return { status: "miss" };
        }
        if (filters.requireScreenshot && entry.hasScreenshot !== true) {
          return { status: "miss" };
        }
        this.counters.hit += 1;
        return { status: "hit", value: entry.value, ageMs };
      }

      // Key absent: consult the windowed negative marker before the source.
      // The proof uses the *entry* age limit: an entry that existed at the
      // marker time is stale by now, and no entry can have been written since
      // (a write deletes the marker).
      if (this.negativeTtlMs > 0 && filters.minAgeMs === undefined) {
        const marker = await withTimeout(
          redis.get(this.negativeKey(variantKey)),
          this.timeoutMs,
        );
        if (!timedOut(marker) && marker !== TIMED_OUT && marker !== null) {
          const emptyFrom = Number(marker);
          if (
            Number.isFinite(emptyFrom) &&
            isNegativeStillValid(emptyFrom, maxAgeMs, Date.now())
          ) {
            this.counters.negativeHit += 1;
            return { status: "negative" };
          }
        }
      }

      this.counters.miss += 1;
      return { status: "miss" };
    } catch (error) {
      this.counters.error += 1;
      logger.debug({ error }, "Variant cache read failed");
      return { status: "error" };
    }
  }

  async write(
    dimensions: VariantDimensions,
    value: T,
    meta: { hasScreenshot?: boolean } = {},
  ): Promise<boolean> {
    if (!redisIsReady()) return false;

    const variantKey = deriveVariantKey(dimensions);
    const envelope: CacheEnvelope<T> = {
      createdAt: Date.now(),
      hasScreenshot: meta.hasScreenshot,
      value,
    };
    const serialized = JSON.stringify(envelope);

    try {
      const pipeline = redis
        .pipeline()
        .hset(this.readKey(variantKey), variantKey, serialized)
        .expire(this.readKey(variantKey), this.options.entryTtlSeconds)
        .del(this.negativeKey(variantKey))
        .hlen(this.readKey(variantKey));
      const results = await pipeline.exec();
      if (!results) return false;

      const writeError = results.find(([error]) => error !== null)?.[0] ?? null;
      if (writeError) {
        this.counters.writeFailed += 1;
        logger.debug({ error: writeError.message }, "Variant cache write failed");
      }

      // A surviving negative marker would falsely keep proving "nothing has
      // been inserted since", so the DEL above is retried unconditionally.
      // Deleting a marker is always safe: the worst case is one extra read.
      const delSlot = results[2];
      if (delSlot && delSlot[0] !== null) {
        await redis.del(this.negativeKey(variantKey)).catch(() => undefined);
      }

      const length = Number(results[3]?.[1] ?? 0);
      if (length > this.entryCap) await this.evictOldest(variantKey);

      this.counters.write += 1;
      return true;
    } catch (error) {
      this.counters.writeFailed += 1;
      logger.debug({ error }, "Variant cache write threw");
      return false;
    }
  }

  /**
   * Records that, as of now, nothing existed for this variant. The proof
   * covers `[now - maxAgeMs, now]`.
   *
   * The marker must outlive the moment it becomes *usable*: it only proves
   * emptiness once every possible entry has aged out, which is one entry TTL
   * after it was written. A marker that expired at that exact moment would
   * make the whole negative cache unreachable.
   */
  async writeNegative(dimensions: VariantDimensions): Promise<void> {
    if (this.negativeTtlMs <= 0 || !redisIsReady()) return;
    const variantKey = deriveVariantKey(dimensions);
    const key = this.negativeKey(variantKey);
    const ttlSeconds = Math.ceil((this.negativeTtlMs + this.entryTtlMs) / 1_000);
    try {
      await withTimeout(
        redis.set(key, String(Date.now()), "EX", ttlSeconds),
        this.timeoutMs,
      );
    } catch {
      // A negative marker is an optimization; losing it costs one read.
    }
  }

  async delete(dimensions: VariantDimensions): Promise<void> {
    if (!redisIsReady()) return;
    const variantKey = deriveVariantKey(dimensions);
    try {
      await redis.hdel(this.readKey(variantKey), variantKey);
    } catch {
      // Best-effort self-heal.
    }
  }

  /** Oldest-first bounded eviction; unparseable entries sort to epoch. */
  private async evictOldest(variantKey: string): Promise<void> {
    try {
      const all = await redis.hgetall(this.readKey(variantKey));
      const entries = Object.entries(all)
        .map(([key, raw]) => {
          const parsed = this.parseEnvelope(raw);
          return { key, createdAt: parsed?.createdAt ?? 0 };
        })
        .sort((a, b) => a.createdAt - b.createdAt);
      const excess = entries.length - this.entryCap;
      if (excess <= 0) return;
      await redis.hdel(
        this.readKey(variantKey),
        ...entries.slice(0, excess).map((entry) => entry.key),
      );
    } catch {
      // Eviction failure only costs memory; the TTL still applies.
    }
  }

  private parseEnvelope(raw: string): CacheEnvelope<T> | null {
    try {
      const parsed = JSON.parse(raw) as CacheEnvelope<T>;
      if (typeof parsed?.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  stats(): typeof this.counters {
    return { ...this.counters };
  }
}
