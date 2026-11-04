/**
 * Deterministic per-entity jitter.
 *
 * Random jitter spreads load but re-rolls on every process: N replicas each
 * schedule the same monitor and can still coincide. Hashing the entity id
 * gives every entity a *fixed* offset — the same monitor always defers the
 * same way — while still spreading across the fleet. Jitter is capped at half
 * the interval so it can never postpone work past its own next run.
 */

import { createHash } from "node:crypto";

/** Stable integer in `[0, modulus)` for a key. */
function hashInt(key: string, modulus: number): number {
  const digest = createHash("sha256").update(key).digest();
  return (digest.readUInt32BE(0) % modulus + modulus) % modulus;
}

/** Jitter in `[0, budgetMs)`, identical for identical keys. */
export function hashJitterMs(key: string, budgetMs: number): number {
  if (budgetMs <= 0) return 0;
  return hashInt(key, budgetMs);
}

/** `from + jitter`, where jitter ≤ min(intervalMs/2, 5 min). */
export function deferredRunAt(from: Date, intervalMs: number, key: string): Date {
  const budget = Math.min(Math.max(intervalMs, 0) / 2, 5 * 60_000);
  return new Date(from.getTime() + hashJitterMs(key, budget));
}

/** The next whole-minute boundary after `from`. */
export function alignToNextMinute(from: Date = new Date()): Date {
  return new Date(Math.ceil(from.getTime() / 60_000) * 60_000);
}

/** The next boundary of a fixed cadence after `from` (aligned to epoch). */
export function alignToCadence(from: Date, intervalMs: number): Date {
  if (intervalMs <= 0) return new Date(from.getTime());
  return new Date(Math.ceil(from.getTime() / intervalMs) * intervalMs);
}
