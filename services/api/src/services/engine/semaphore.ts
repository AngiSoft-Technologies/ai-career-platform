/**
 * Redis lease semaphore.
 *
 * A counting semaphore over a lease ZSET, with three properties that a plain
 * "acquire → try/finally release" gets wrong:
 *
 *  1. **Idempotent re-acquire.** A holder that already holds the slot keeps
 *     it, refreshed — so a retry loop cannot deadlock against itself, and a
 *     crashed-then-resumed holder does not need a separate recovery path.
 *  2. **Heartbeat raced against the work.** The lease is renewed at half its
 *     TTL *while the work runs*. If a heartbeat is lost (the process stalled,
 *     the lease expired), the work rejects with `SemaphoreLostError` rather
 *     than continuing against a slot it no longer owns.
 *  3. **Blocking acquire with jittered backoff**, so waiters do not synchronise.
 *
 * Expired holders are garbage-collected server-side on every acquire, so a
 * worker that died without releasing frees its slot within one TTL.
 */

import { logger } from "../../logger.js";
import { backoffWithJitter } from "../../lib/retry.js";
import { redisIsReady, runScript } from "../../lib/redis-scripts.js";

export class SemaphoreLostError extends Error {
  constructor(readonly holder: string) {
    super(`Semaphore lease lost for holder ${holder}`);
    this.name = "SemaphoreLostError";
  }
}

export interface SemaphoreOptions {
  /** Lease TTL. Renewed at half this interval while work runs. */
  ttlMs?: number;
}

export class RedisSemaphore {
  private readonly ttlMs: number;

  constructor(
    private readonly key: string,
    private readonly limit: number,
    options: SemaphoreOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 30_000;
  }

  /** Non-blocking. `true` = granted (or already held, refreshed). */
  async acquire(holder: string): Promise<boolean> {
    if (!redisIsReady() || this.limit <= 0) return false;
    try {
      const result = await runScript(
        "semaphoreAcquire",
        [this.key],
        [holder, this.limit, this.ttlMs],
      );
      if (result === null) return false; // Redis unavailable: fail closed
      const [granted] = result as [number, number, number];
      return Number(granted) === 1;
    } catch (error) {
      logger.debug({ error, holder }, "Semaphore acquire failed");
      return false;
    }
  }

  /** Waits up to `timeoutMs` for a slot. Rejects only on abort. */
  async acquireBlocking(
    holder: string,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;

    for (;;) {
      if (options.signal?.aborted) return false;
      if (await this.acquire(holder)) return true;
      if (Date.now() >= deadline) return false;

      await new Promise((resolve) =>
        setTimeout(resolve, backoffWithJitter(50, attempt++, 250)),
      );
    }
  }

  /**
   * Runs `work` holding a slot, renewing the lease at half its TTL. If a
   * renewal is lost the work's promise rejects — the caller learns the slot
   * was taken, rather than silently over-admitting.
   */
  async run<T>(holder: string, work: () => Promise<T>): Promise<T> {
    if (!(await this.acquire(holder))) {
      throw new SemaphoreLostError(holder);
    }

    let renewalFailures = 0;
    let stopped = false;
    const renew = async (): Promise<void> => {
      if (stopped) return;
      try {
        const held = await runScript(
          "semaphoreHeartbeat",
          [this.key],
          [holder, this.ttlMs],
        );
        if (held === null) return; // Redis blip; try again next tick
        if (Number(held) !== 1) {
          throw new SemaphoreLostError(holder);
        }
        renewalFailures = 0;
      } catch (error) {
        renewalFailures += 1;
        if (renewalFailures >= 2) throw error;
      }
    };

    // The race between the work and its heartbeat is the point: a lost
    // heartbeat must abort the work, not merely be logged.
    let rejectGuard: (error: unknown) => void = () => {};
    const guard: Promise<never> = new Promise((_, reject) => {
      rejectGuard = reject;
    });
    void (async () => {
      while (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, this.ttlMs / 2));
        if (stopped) return;
        try {
          await renew();
        } catch (error) {
          rejectGuard(error);
          return;
        }
      }
    })();

    try {
      return await Promise.race([work(), guard]);
    } finally {
      stopped = true;
      await this.release(holder);
    }
  }

  async release(holder: string): Promise<void> {
    if (!redisIsReady()) return;
    try {
      await runScript("semaphoreRelease", [this.key], [holder, 0]);
    } catch (error) {
      logger.debug({ error, holder }, "Semaphore release failed");
    }
  }

  /** Current holder count, for dashboards. */
  async inUse(): Promise<number> {
    if (!redisIsReady()) return 0;
    try {
      const { redis } = await import("../../db/redis.js");
      return await redis.zcard(this.key);
    } catch {
      return 0;
    }
  }
}

/**
 * Convenience wrapper: run `fn` under a named semaphore, blocking briefly
 * for a slot. Falls back to running uncapped when Redis is unavailable —
 * a throttle failure degrades throughput, it does not fail the work.
 */
export async function withSemaphore<T>(
  key: string,
  limit: number,
  holder: string,
  fn: () => Promise<T>,
  options: SemaphoreOptions & { timeoutMs?: number } = {},
): Promise<T> {
  if (!redisIsReady() || limit <= 0) return fn();

  const semaphore = new RedisSemaphore(key, limit, options);
  const granted = await semaphore.acquireBlocking(holder, {
    timeoutMs: options.timeoutMs ?? 15_000,
  });
  if (!granted) {
    // Timed out waiting: proceed rather than fail the caller's work.
    logger.debug({ key, holder }, "Semaphore wait timed out; proceeding");
    return fn();
  }

  try {
    return await fn();
  } finally {
    await semaphore.release(holder);
  }
}
