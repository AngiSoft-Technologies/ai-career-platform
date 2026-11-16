/**
 * The one-second clock.
 *
 * The backend is a continuous service, so it owns its own heartbeat instead
 * of being woken by a scheduler that lives somewhere else. One timer fires
 * once a second; every dispatch is "this work is due, hand it to a queue",
 * never "do the work here" — the queue workers do the work, and the clock
 * never waits for them.
 *
 * Three properties this file exists to guarantee, each of which was a
 * production failure first:
 *
 *  1. **The clock never depends on a handler.** The next tick is armed from
 *     the previous boundary before any entry runs, and each entry runs under
 *     its own deadline. A handler that hangs therefore costs that entry, not
 *     the clock — and a stopped clock silently stops every periodic job.
 *  2. **A tick is a heartbeat, not a queue.** If the previous tick is still
 *     in flight the new one is skipped, never queued behind it.
 *  3. **One replica enqueues.** Dispatch is guarded by the same Redis lease
 *     the distributed tick uses (`SET key NX EX ttl`), so N replicas give N
 *     claims and exactly one winner per cadence boundary. When Redis is
 *     unreachable the tick is skipped by default: duplicate ingestion is
 *     worse than a late one. Set `runWhenRedisDown` for single-replica
 *     deployments where skipping means never running.
 *
 * Wall-clock alignment matters: the timer is re-armed from `boundary +
 * period`, not from "now", so a slow tick widens the gap instead of
 * collapsing the cadence into a tight loop.
 */

import { logger } from "../logger.js";
import { claimTick, releaseTick } from "./distributed-tick.js";
import { alignToCadence } from "./jitter.js";
import { redisIsReady } from "./redis-scripts.js";

export interface TickerEntry {
  /** Stable, unique key. Also the Redis lease name suffix. */
  name: string;
  /** How often this entry may run, in milliseconds. */
  intervalMs: number;
  /** Set false to keep the entry registered but silenced (kill switch). */
  enabled?: boolean;
  /** The dispatch. Must resolve quickly — it enqueues, it does not work. */
  run: () => Promise<void>;
}

export interface TickerOptions {
  /** Clock period. Defaults to 1000ms: a one-second heartbeat. */
  intervalMs?: number;
  /** Run an entry locally when Redis cannot answer a claim. Default false. */
  runWhenRedisDown?: boolean;
  /** Label for logs. Defaults to "ticker". */
  label?: string;
}

export interface TickerHandle {
  stop: () => void;
}

export interface TickerEntryStatus {
  name: string;
  intervalMs: number;
  enabled: boolean;
  runs: number;
  skips: number;
  errors: number;
  lastStartedAt: number | null;
  lastDurationMs: number | null;
}

export interface TickerStatus {
  label: string;
  intervalMs: number;
  startedAt: number;
  uptimeMs: number;
  ticks: number;
  skippedTicks: number;
  dispatches: number;
  errors: number;
  lastTickAt: number | null;
  lastTickDurationMs: number | null;
  entries: TickerEntryStatus[];
}

/** The mutable state; `tickerStatus` derives `uptimeMs` on read. */
interface TickerState extends Omit<TickerStatus, "uptimeMs"> {}

/** How long one entry's dispatch may take before the clock skips it. */
const DISPATCH_DEADLINE_MS = 10_000;

function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`DEADLINE_EXCEEDED: ${label} exceeded ${ms}ms`));
    }, ms);
    // Deliberately not unref'd: the deadline is what keeps a hung dispatch
    // from holding the clock, so it must fire even when nothing else keeps
    // the event loop busy.
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

let state: TickerState | null = null;

/** Live clock stats, for /health and the metrics route. Null when not started. */
export function tickerStatus(): TickerStatus | null {
  if (!state) return null;
  return { ...state, uptimeMs: Date.now() - state.startedAt };
}

export function startTicker(
  entries: TickerEntry[],
  options: TickerOptions = {},
): TickerHandle {
  const label = options.label ?? "ticker";
  const intervalMs = Math.max(1, options.intervalMs ?? 1_000);

  const entryStatus: TickerEntryStatus[] = entries.map((entry) => ({
    name: entry.name,
    intervalMs: entry.intervalMs,
    enabled: entry.enabled !== false,
    runs: 0,
    skips: 0,
    errors: 0,
    lastStartedAt: null,
    lastDurationMs: null,
  }));

  state = {
    label,
    intervalMs,
    startedAt: Date.now(),
    ticks: 0,
    skippedTicks: 0,
    dispatches: 0,
    errors: 0,
    lastTickAt: null,
    lastTickDurationMs: null,
    entries: entryStatus,
  };

  // The last boundary at which each entry was dispatched. Wall-clock
  // milliseconds, so a restart resets the cadence rather than inheriting a
  // stale "due" from the previous process.
  const lastDispatched = new Map<string, number>();
  const inFlight = new Set<string>();

  const live = (): TickerState => {
    if (!state) throw new Error("Ticker state is missing");
    return state;
  };

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let ticking = false;

  /** Runs one dispatch, records it, and releases the lease it was given. */
  const runEntry = async (
    entry: TickerEntry,
    stat: TickerEntryStatus,
    boundary: number,
    token: string | null,
  ): Promise<void> => {
    inFlight.add(entry.name);
    lastDispatched.set(entry.name, boundary);
    stat.lastStartedAt = boundary;
    const startedAt = Date.now();
    try {
      await withDeadline(entry.run(), DISPATCH_DEADLINE_MS, `ticker:${entry.name}`);
      stat.runs += 1;
      live().dispatches += 1;
    } catch (error) {
      stat.errors += 1;
      live().errors += 1;
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), entry: entry.name },
        "Ticker dispatch failed",
      );
    } finally {
      stat.lastDurationMs = Date.now() - startedAt;
      inFlight.delete(entry.name);
      // Released after the dispatch, so the lease covers the whole window in
      // which another replica could have started a copy.
      if (token) {
        await releaseTick(`ticker:${entry.name}`, token);
      }
    }
  };

  const dispatch = async (entry: TickerEntry, stat: TickerEntryStatus): Promise<void> => {
    if (stat.enabled === false) return;
    if (inFlight.has(entry.name)) {
      stat.skips += 1;
      return;
    }

    const boundary = Date.now();
    if (boundary - (lastDispatched.get(entry.name) ?? 0) < entry.intervalMs) return;

    // Lease TTL is the cadence in whole seconds, floored at one: a 5s entry
    // gets 5s, a sub-second entry gets 1s. Without the lease every replica
    // dispatches on every tick.
    const ttlSeconds = Math.max(1, Math.ceil(entry.intervalMs / 1000));
    const lease = `ticker:${entry.name}`;
    const token = await claimTick(lease, ttlSeconds);

    if (token === null) {
      // A missing claim has two very different causes, and only one of them
      // should stop the job: another replica won the tick (correct, skip), or
      // Redis could not answer (a single-replica deploy where skipping means
      // never running — opt in and run locally without a lease).
      if (options.runWhenRedisDown && !redisIsReady()) {
        logger.debug(
          { entry: entry.name },
          "Redis could not answer the tick claim; running locally",
        );
        await runEntry(entry, stat, boundary, null);
        return;
      }

      stat.skips += 1;
      return;
    }

    await runEntry(entry, stat, boundary, token);
  };

  const fire = async (): Promise<void> => {
    if (stopped || ticking) {
      if (ticking && state) state.skippedTicks += 1;
      return;
    }
    ticking = true;
    const startedAt = Date.now();
    try {
      for (let index = 0; index < entries.length; index += 1) {
        if (stopped) break;
        const entry = entries[index];
        const status = entryStatus[index];
        if (!entry || !status) continue;
        await dispatch(entry, status);
      }
    } finally {
      ticking = false;
      if (state) {
        state.ticks += 1;
        state.lastTickAt = Date.now();
        state.lastTickDurationMs = Date.now() - startedAt;
      }
    }
  };

  /**
   * Re-armed from the boundary that just fired, not from "now", so a slow
   * tick widens the gap instead of collapsing the cadence. Armed *before* the
   * tick body runs: no dispatch may decide whether the next tick happens.
   */
  const arm = (boundary: number): void => {
    if (stopped) return;
    const delay = Math.max(0, boundary - Date.now());
    timer = setTimeout(() => {
      void fire().finally(() => arm(boundary + intervalMs));
    }, delay);
    // Deliberately *not* unref'd. This process is the continuous backend
    // service: the clock is the reason it exists, and an unref'd timer would
    // let it exit the moment nothing else held the event loop open.
  };

  arm(alignToCadence(new Date(Date.now()), intervalMs).getTime());

  logger.info(
    {
      label,
      intervalMs,
      entries: entries.map((entry) => ({ name: entry.name, every: entry.intervalMs })),
    },
    "Backend ticker started",
  );

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      logger.info({ label }, "Backend ticker stopped");
    },
  };
}