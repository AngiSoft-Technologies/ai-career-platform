/**
 * Deterministic rollout sampling.
 *
 * The bucket is a pure function of the cohort key, so a cohort that is in at
 * 5% is still in at 30% — a ramp only ever *adds* cohorts, never reshuffles
 * them. `Math.random() < percent` does not have that property: a cohort can
 * flip sides mid-experiment, which makes before/after comparison and support
 * questions unanswerable.
 *
 * FNV-1a keeps this dependency-free and allocation-free.
 */

const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

/** 32-bit FNV-1a hash of a string, returned unsigned. */
export function fnv1a(key: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Percentile bucket for a cohort key, in `[0, 100)`.
 * Deterministic: the same key always lands in the same bucket.
 */
export function deterministicPercentage(key: string): number {
  return (fnv1a(key) / 0x1_0000_0000) * 100;
}

/** Fractional bucket for a cohort key, in `[0, 1)`. */
export function cohortBucket(key: string): number {
  return fnv1a(key) / 0x1_0000_0000;
}

/**
 * Whether a cohort key falls inside a percentage ramp.
 *
 * Use for anything a support question could be asked about: billing routes,
 * engine experiments, feature flags, cache-bypass budgets.
 */
export function sampled(cohortKey: string, percent: number): boolean {
  if (!Number.isFinite(percent) || percent <= 0) return false;
  if (percent >= 100) return true;
  return deterministicPercentage(cohortKey) < percent;
}

/**
 * Splits a key space into independent ramps. `sha256(key):experiment` keeps
 * two experiments on the same entity decorrelated, so ramping one never
 * perturbs the other's cohorts.
 */
export function experimentKey(entityId: string, experiment: string): string {
  return `${entityId}:${experiment}`;
}
