function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

/**
 * Returns the durable cooldown for an automatic preparation setup failure.
 *
 * The delay grows exponentially and is capped so a broken candidate cannot
 * monopolize the scheduler, while a temporary failure still gets a small
 * number of prompt retries.
 */
export function automaticPreparationRetryDelayMs(
  attemptCount: number,
  baseDelayMs = Number(process.env.APPLICATION_PREPARATION_BACKOFF_MS ?? 30_000),
): number {
  const base = boundedInteger(baseDelayMs, 30_000, 1_000, 10 * 60_000);
  const attempt = Math.max(1, Math.trunc(attemptCount));
  const exponent = Math.min(attempt - 1, 12);
  return Math.min(base * 2 ** exponent, 60 * 60_000);
}

export interface AutomaticPreparationFailureState {
  attemptCount: number;
  nextAttemptAt: Date;
  quarantinedUntil: Date | null;
}

/**
 * Computes the durable state for an automatic setup failure.
 *
 * A failed candidate is retried with exponential backoff. Once its bounded
 * attempt budget is spent, it is quarantined for a longer interval so it
 * cannot consume every automatic scheduler slot. When that quarantine
 * expires, the candidate starts a fresh generation rather than remaining
 * permanently exhausted.
 */
export function automaticPreparationFailureState(input: {
  previousAttemptCount?: number;
  previousQuarantinedUntil?: Date | null;
  now?: Date;
  maxAttempts: number;
  baseDelayMs?: number;
  quarantineMs: number;
}): AutomaticPreparationFailureState {
  const now = input.now ?? new Date();
  const maxAttempts = boundedInteger(input.maxAttempts, 3, 1, 10);
  const quarantineMs = boundedInteger(
    input.quarantineMs,
    24 * 60 * 60_000,
    1_000,
    7 * 24 * 60 * 60_000,
  );
  const previousAttemptCount = boundedInteger(
    input.previousAttemptCount,
    0,
    0,
    10,
  );
  const quarantineExpired = Boolean(
    input.previousQuarantinedUntil &&
    input.previousQuarantinedUntil.getTime() <= now.getTime(),
  );
  const attemptCount = quarantineExpired
    ? 1
    : previousAttemptCount + 1;
  const retryDelayMs = automaticPreparationRetryDelayMs(
    attemptCount,
    input.baseDelayMs,
  );

  return {
    attemptCount,
    nextAttemptAt: new Date(now.getTime() + retryDelayMs),
    quarantinedUntil: attemptCount >= maxAttempts
      ? new Date(now.getTime() + quarantineMs)
      : null,
  };
}
