function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

export interface PreparationReconciliationOptions {
  limit?: number;
  maxAttempts?: number;
  leaseMs?: number;
}

export interface BoundedPreparationReconciliationOptions {
  limit: number;
  maxAttempts: number;
  leaseMs: number;
}

export function boundedPreparationReconciliationOptions(
  options: PreparationReconciliationOptions = {},
  environment: Record<string, string | undefined> = process.env,
): BoundedPreparationReconciliationOptions {
  return {
    limit: boundedInteger(
      options.limit ??
        Number(environment.APPLICATION_RECONCILIATION_BATCH_SIZE ?? 100),
      100,
      1,
      500,
    ),
    maxAttempts: boundedInteger(
      options.maxAttempts ??
        Number(environment.APPLICATION_PREPARATION_MAX_ATTEMPTS ?? 3),
      3,
      1,
      10,
    ),
    leaseMs: boundedInteger(
      options.leaseMs ??
        Number(environment.APPLICATION_PREPARATION_DISPATCH_LEASE_MS ?? 60_000),
      60_000,
      1_000,
      60 * 60_000,
    ),
  };
}

export const PREPARATION_DISPATCH_BATCH_SIZE = 25;

/**
 * Splits preparation handoffs into bounded batches without dropping or
 * duplicating a row. A failed Redis operation in one batch is caught by the
 * caller and cannot prevent the next batch from being attempted.
 */
export function partitionPreparationDispatchBatches<T>(
  rows: T[],
  batchSize = PREPARATION_DISPATCH_BATCH_SIZE,
): T[][] {
  const size = boundedInteger(batchSize, PREPARATION_DISPATCH_BATCH_SIZE, 1, 100);
  const batches: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) {
    batches.push(rows.slice(offset, offset + size));
  }
  return batches;
}
