/**
 * Retry with a validity predicate.
 *
 * Two ideas worth stealing from the reference implementation:
 *
 *  1. Success is decided by a *result-validity type guard*, not by the
 *     absence of a throw. A 200 response whose body does not match the
 *     expected schema is retried, not accepted.
 *  2. Aborts are first-class: `abortableSleep` resolves immediately on an
 *     aborted signal, and `AbortError` is swallowed at the boundary rather
 *     than logged as a failure.
 */

export const RETRY_DELAYS = [500, 1_500, 3_000] as const;

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    // NOTE: deliberately not unref'd. A retry delay is pending work; if this
    // were the only handle left, an unref'd timer would let the process exit
    // mid-retry. Callers that want a timer that cannot hold the loop open
    // should use withTimeout's parked-timer pattern instead.
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs `operation` until it returns a result the guard accepts, the attempt
 * budget is exhausted, or the signal fires. Returns the accepted result, or
 * `null` when every attempt was rejected.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T | null>,
  hasValidResult: (result: T | null) => result is T,
  signal?: AbortSignal,
  maxAttempts = 4,
  retryDelays: readonly number[] = RETRY_DELAYS,
): Promise<T | null> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) return null;

    try {
      const result = await operation();
      if (hasValidResult(result)) return result;
    } catch (error) {
      if (isAbortError(error)) return null;
      lastError = error;
    }

    if (attempt < retryDelays.length && attempt + 1 < maxAttempts) {
      const delay = retryDelays[attempt] ?? retryDelays[retryDelays.length - 1] ?? 0;
      await abortableSleep(delay, signal);
    }
  }

  if (lastError && !isAbortError(lastError)) {
    // Callers that care can log this; the helper itself stays silent so a
    // rejected-but-recoverable operation does not spam.
  }
  return null;
}

/** Exponential backoff with full jitter, capped. Used by blocking loops. */
export function backoffWithJitter(
  baseMs: number,
  attempt: number,
  capMs: number,
): number {
  const exponential = Math.min(baseMs * 1.5 ** attempt, capMs);
  return exponential + Math.random() * (exponential / 4);
}
