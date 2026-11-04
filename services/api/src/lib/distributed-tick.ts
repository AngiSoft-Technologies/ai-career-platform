/**
 * Distributed tick — the minute-aligned cron without a cron library.
 *
 * Continuous `setInterval` loops have a specific failure mode on a multi-
 * replica deploy: every replica fires the same timer and every replica
 * enqueues the same job. The fix is a cheap distributed claim:
 *
 *   - ticks are aligned to the cadence boundary, not to process start, so the
 *     release/acquire gap never widens under clock skew;
 *   - `SET key NX EX ttl` claims a tick, with the value being `pid:timestamp`
 *     so a stuck holder's claim expires before the next tick fires (55s for a
 *     60s cadence);
 *   - only the claim's winner runs the handler.
 *
 * When Redis is unreachable the tick is skipped by default: a duplicated
 * discovery run is worse than a delayed one. Set `runWhenRedisDown` for
 * single-replica deployments where skipping means never running.
 *
 * Three properties this file exists to guarantee, each of which was a
 * production failure first:
 *
 *  1. **The cadence does not depend on the handler.** The next timer is armed
 *     *before* the handler runs. A handler that never settles (a Redis
 *     command on a connection with unlimited retries, a socket that never
 *     answers) used to wedge the whole chain: the tick stopped, and with it
 *     every periodic job on that process — silently, with no error.
 *  2. **Every Redis call in the claim path is bounded.** The worker
 *     connection runs with `maxRetriesPerRequest: null` (BullMQ requires it),
 *     which means a command issued during an outage can stay pending
 *     indefinitely. The claim path therefore uses the *application* client,
 *     which fails fast, and wraps it in a timeout anyway.
 *  3. **The claim is exclusive.** `SET NX` — without it, `SET` overwrites the
 *     holder's token and every replica believes it won, so every replica
 *     enqueued the same job on every tick.
 */

import { randomUUID } from "node:crypto";
import { redis } from "../db/redis.js";
import { logger } from "../logger.js";
import { alignToCadence } from "./jitter.js";
import { redisIsReady, runScript, TIMED_OUT, withTimeout } from "./redis-scripts.js";

export interface TickHandle {
  stop: () => void;
}

/** How long a Redis call in the claim path may take. */
const CLAIM_TIMEOUT_MS = 2_000;

export async function claimTick(
  name: string,
  ttlSeconds: number,
  timeoutMs = CLAIM_TIMEOUT_MS,
): Promise<string | null> {
  if (!redisIsReady()) return null;
  const token = `${process.pid}:${Date.now()}:${randomUUID().slice(0, 8)}`;
  try {
    // `NX` makes the claim exclusive: the first holder wins, and everyone
    // else is told the tick is taken.
    const result = await withTimeout(
      redis.set(name, token, "EX", ttlSeconds, "NX"),
      timeoutMs,
    );
    if (result === TIMED_OUT) {
      logger.warn({ tick: name }, "Tick claim timed out; skipping this tick");
      return null;
    }
    return result === "OK" ? token : null;
  } catch {
    return null;
  }
}

export async function releaseTick(
  name: string,
  token: string,
  timeoutMs = CLAIM_TIMEOUT_MS,
): Promise<void> {
  if (!redisIsReady()) return;
  await withTimeout(runScript("releaseIfEqual", [name], [token]), timeoutMs);
}

export interface DistributedIntervalOptions {
  /** Claim TTL. Defaults to the cadence minus a safety margin. */
  ttlSeconds?: number;
  /** Run locally when Redis cannot answer a claim. Default false. */
  runWhenRedisDown?: boolean;
  /** Label for logs. Defaults to the tick name. */
  label?: string;
  /** Timeout for the Redis calls in the claim path. */
  redisTimeoutMs?: number;
}

export function startDistributedInterval(
  name: string,
  intervalMs: number,
  handler: () => Promise<void>,
  options: DistributedIntervalOptions = {},
): TickHandle {
  const label = options.label ?? name;
  const ttlSeconds =
    options.ttlSeconds ?? Math.max(5, Math.floor(intervalMs / 1000) - 5);
  const redisTimeoutMs = options.redisTimeoutMs ?? CLAIM_TIMEOUT_MS;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const fire = async (): Promise<void> => {
    if (stopped || running) {
      // A tick is a heartbeat, not a queue. If the previous run is still
      // going, this one is skipped rather than queued behind it.
      if (running) {
        logger.debug({ tick: label }, "Tick skipped; previous run still in flight");
      }
      return;
    }
    running = true;

    try {
      const token = await claimTick(name, ttlSeconds, redisTimeoutMs);
      if (token === null) {
        if (options.runWhenRedisDown && !redisIsReady()) {
          await handler();
        }
        return;
      }

      const startedAt = Date.now();
      try {
        await handler();
        logger.debug({ tick: label, durationMs: Date.now() - startedAt }, "Tick ran");
      } catch (error) {
        logger.warn({ error, tick: label }, "Distributed tick handler failed");
      } finally {
        await releaseTick(name, token, redisTimeoutMs);
      }
    } catch (error) {
      logger.warn({ error, tick: label }, "Distributed tick failed");
    } finally {
      running = false;
    }
  };

  /**
   * Arms the next tick from the boundary that was just fired — not from
   * "now" — so a slow handler cannot collapse the cadence into a tight loop.
   *
   * The next timer is armed *before* the handler is invoked: the handler's
   * promise is never allowed to decide whether the next tick happens.
   */
  const arm = (boundary: number): void => {
    if (stopped) return;
    const delay = Math.max(0, boundary - Date.now());
    timer = setTimeout(() => {
      void fire();
      arm(boundary + intervalMs);
    }, delay);
    timer.unref?.();
  };

  arm(alignToCadence(new Date(Date.now()), intervalMs).getTime());

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
