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
 */

import { randomUUID } from "node:crypto";
import { redis } from "../db/redis.js";
import { logger } from "../logger.js";
import { alignToCadence } from "./jitter.js";
import { redisIsReady, runScript } from "./redis-scripts.js";

export interface TickHandle {
  stop: () => void;
}

export async function claimTick(
  name: string,
  ttlSeconds: number,
): Promise<string | null> {
  if (!redisIsReady()) return null;
  const token = `${process.pid}:${Date.now()}:${randomUUID().slice(0, 8)}`;
  try {
    const result = await redis.set(name, token, "EX", ttlSeconds);
    return result === "OK" ? token : null;
  } catch {
    return null;
  }
}

export async function releaseTick(name: string, token: string): Promise<void> {
  if (!redisIsReady()) return;
  await runScript("releaseIfEqual", [name], [token]);
}

export interface DistributedIntervalOptions {
  /** Claim TTL. Defaults to the cadence minus a safety margin. */
  ttlSeconds?: number;
  /** Run locally when Redis cannot answer a claim. Default false. */
  runWhenRedisDown?: boolean;
  /** Label for logs. Defaults to the tick name. */
  label?: string;
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

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const fire = async (): Promise<void> => {
    if (stopped) return;

    const token = await claimTick(name, ttlSeconds);
    if (token === null) {
      if (options.runWhenRedisDown && !redisIsReady()) {
        try {
          await handler();
        } catch (error) {
          logger.debug({ error, tick: label }, "Distributed tick failed (local run)");
        }
      }
      // Either another replica holds the tick, or Redis is down and we skip.
      return;
    }

    const startedAt = Date.now();
    try {
      await handler();
      logger.debug({ tick: label, durationMs: Date.now() - startedAt }, "Tick ran");
    } catch (error) {
      logger.warn({ error, tick: label }, "Distributed tick handler failed");
    } finally {
      await releaseTick(name, token);
    }
  };

  const schedule = (): void => {
    if (stopped) return;
    const now = Date.now();
    const next = alignToCadence(new Date(now), intervalMs).getTime();
    timer = setTimeout(() => {
      void fire().finally(schedule);
    }, Math.max(0, next - now));
    timer.unref?.();
  };

  schedule();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
