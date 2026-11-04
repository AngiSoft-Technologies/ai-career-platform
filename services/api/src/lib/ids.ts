/**
 * Identity keys.
 *
 * Two techniques from the reference implementation, both cheap and both
 * load-bearing at scale:
 *
 *  1. **Hash-prefixed keys.** Time-ordered identifiers (UUIDv7) concentrate
 *     in one partition of any hash-partitioned store, because their prefixes
 *     are monotonically increasing. Salting with a content hash spreads
 *     writes across the whole key space.
 *  2. **Canonical URL identity.** A URL's identity for caching and dedup is
 *     its normalised form: lowercased scheme/host, no `www.`, no trailing
 *     slash, no fragment.
 */

import { createHash } from "node:crypto";

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Saves a caller from asking "is this a UUID at all?" before reading a store:
 * a malformed id is *not found*, never an outage.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * `<sha256(id)[0:8]>-<id>` — the hot-key-safe spelling of a sequential id.
 * The prefix decorrelates key ordering from time ordering without making the
 * original id unreadable in a debugger.
 */
export function hotKeySafe(id: string): string {
  return `${sha256Hex(id).slice(0, 8)}-${id}`;
}

/**
 * Identity key for a byte payload. Same idea as content-addressed caches:
 * identical bytes must map to identical keys so a cache hit is provably a
 * hit.
 */
export function contentKey(payload: string | Uint8Array): string {
  return sha256Hex(payload);
}

/** Normalised URL identity (scheme/host lowercase, no www, no trailing slash, no fragment). */
export function normaliseUrlIdentity(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let path = url.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    url.pathname = path;
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Hash of a normalised URL. Used as the lookup key for the URL index and as
 * the deduplication key anywhere URLs arrive in trivial variants.
 */
export function hashUrl(rawUrl: string): string {
  return sha256Hex(normaliseUrlIdentity(rawUrl));
}

/** Deterministic per-entity integer in `[0, modulus)`. Stable across processes. */
export function stableIndex(key: string, modulus: number): number {
  if (modulus <= 0) return 0;
  return Number.parseInt(sha256Hex(key).slice(0, 8), 16) % modulus;
}
