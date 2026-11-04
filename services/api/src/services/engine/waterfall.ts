/**
 * Engine waterfall — a declarative fetch pipeline that re-plans itself.
 *
 * The single most valuable idea from the platform study: **do not write an
 * imperative scraper with retries, write a list of engines and let the errors
 * re-plan the list.**
 *
 * How it works:
 *
 *  1. `planFallbacks(meta)` returns the engines that *could* serve this URL
 *     given the current feature flags, in preference order.
 *  2. Every engine is started **concurrently**, each with a "max reasonable
 *     time" timer, so the next engine is already running before the current
 *     one fails. Losers are sniped (aborted with an engine-tier reason).
 *  3. Engines throw **strategy errors**, not failures:
 *       - `AddFeatureError(flags)`    — "I discovered something about this
 *                                       page; re-run the whole waterfall with
 *                                       these flags" (e.g. the page is really
 *                                       a PDF, or we hit an anti-bot wall and
 *                                       need the proxy tier)
 *       - `EngineRetryableError`      — "transient; try again as-is"
 *       - anything else              — terminal; surface it
 *  4. The outer loop catches the strategy errors, mutates `meta.featureFlags`
 *     and re-plans. A retry tracker caps attempts and flag toggles so a
 *     pathological page cannot loop forever.
 *
 * The re-plan is the point. It is how "the site wants a browser" becomes
 * "next attempt uses the proxy tier with a fresh fingerprint" without any
 * caller knowing that happened.
 */

import { AbortManager } from "../../lib/abort-manager.js";
import { logger } from "../../logger.js";

export type FeatureFlag = "proxied" | "stealth";

export class AddFeatureError extends Error {
  constructor(readonly flags: FeatureFlag[]) {
    super(`ADD_FEATURE: ${flags.join(",")}`);
    this.name = "AddFeatureError";
  }
}

export class RemoveFeatureError extends Error {
  constructor(readonly flags: FeatureFlag[]) {
    super(`REMOVE_FEATURE: ${flags.join(",")}`);
    this.name = "RemoveFeatureError";
  }
}

export class EngineRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineRetryableError";
  }
}

/**
 * The loser's rejection reason, so a sniped engine is distinguishable.
 */
export class EngineSnipedError extends Error {
  constructor() {
    super("ENGINE_SNIPED");
    this.name = "EngineSnipedError";
  }
}

/**
 * The engine exceeded its "max reasonable time". This is *not* the same as
 * being sniped: a sniped engine lost a race it could have won, a timed-out
 * engine was too slow to be useful. The waterfall treats the first as noise
 * and the second as the reason the attempt failed.
 */
export class EngineTimeoutError extends Error {
  constructor(readonly engine: string, readonly deadlineMs: number) {
    super(`ENGINE_TIMEOUT: ${engine} exceeded ${deadlineMs}ms`);
    this.name = "EngineTimeoutError";
  }
}

export interface WaterfallMeta {
  url: string;
  /** Mutable: strategy errors mutate this between attempts. */
  featureFlags: Set<FeatureFlag>;
  abort: AbortManager;
  /** Free-form per-attempt state (e.g. response bytes handed between engines). */
  slots: Record<string, unknown>;
}

export interface WaterfallEngine<E> {
  readonly engine: string;
  /** Whether this engine can run given the current flags. */
  supports(meta: WaterfallMeta): boolean;
  run(meta: WaterfallMeta): Promise<E>;
  /**
   * After this long, the next engine starts anyway. The reference platform
   * calls this the "max reasonable time": it is what makes the waterfall
   * *faster* than sequential fallback rather than merely more robust.
   */
  maxReasonableMs(meta: WaterfallMeta): number;
}

export interface WaterfallTracker {
  maxAttempts: number;
  maxFeatureToggles: number;
}

const DEFAULT_TRACKER: WaterfallTracker = { maxAttempts: 4, maxFeatureToggles: 3 };

export interface WaterfallOutcome<E> {
  result: E;
  engine: string;
  attempts: number;
  featureToggles: number;
}

function isStrategyError(error: unknown): error is AddFeatureError | RemoveFeatureError {
  return error instanceof AddFeatureError || error instanceof RemoveFeatureError;
}

/**
 * Runs the waterfall to completion (or exhaustion).
 *
 * `onSnipe` receives the losing engine's result when one exists — useful for
 * keeping a useful artifact produced by an engine that lost the race.
 */
export async function runWaterfall<E>(
  meta: WaterfallMeta,
  engines: WaterfallEngine<E>[],
  options: {
    tracker?: Partial<WaterfallTracker>;
    label?: string;
    /** Called before a retryable attempt restarts (backoff, logging). */
    onRetry?: (attempt: number) => Promise<void>;
  } = {},
): Promise<WaterfallOutcome<E>> {
  const tracker = { ...DEFAULT_TRACKER, ...options.tracker };
  const label = options.label ?? meta.url;

  let attempts = 0;
  let featureToggles = 0;
  let firstTerminalError: unknown = null;

  for (;;) {
    if (attempts >= tracker.maxAttempts) break;
    attempts += 1;

    const planned = engines.filter((engine) => {
      try {
        return engine.supports(meta);
      } catch {
        return false;
      }
    });

    if (planned.length === 0) break;

    const outcome = await raceEngines(meta, planned, label);

    if (outcome.status === "ok") {
      return {
        result: outcome.result,
        engine: outcome.engine,
        attempts,
        featureToggles,
      };
    }

    const error = outcome.error;

    if (isStrategyError(error)) {
      if (featureToggles >= tracker.maxFeatureToggles) break;
      featureToggles += 1;
      if (error instanceof AddFeatureError) {
        for (const flag of error.flags) meta.featureFlags.add(flag);
      } else {
        for (const flag of error.flags) meta.featureFlags.delete(flag);
      }
      logger.debug(
        { url: meta.url, flags: [...meta.featureFlags], error: error.message },
        "Waterfall re-planned",
      );
      continue;
    }

    if (error instanceof EngineRetryableError) {
      logger.debug(
        { url: meta.url, engine: outcome.engine, error: error.message },
        "Waterfall engine retryable",
      );
      await options.onRetry?.(attempts);
      continue;
    }

    if (error instanceof EngineTimeoutError) {
      // No engine answered within its own deadline. Retrying the whole
      // waterfall would just repeat the wait, and the operation-level
      // deadline is usually the next thing to fire anyway.
      firstTerminalError ??= error;
      break;
    }

    if (!(error instanceof EngineSnipedError)) {
      firstTerminalError ??= error;
    }
    break;
  }

  throw (
    firstTerminalError ??
    new Error(`WATERFALL_EXHAUSTED: no engine could serve ${meta.url}`)
  );
}

type RaceOutcome<E> =
  | { status: "ok"; result: E; engine: string }
  | { status: "error"; error: unknown; engine: string | null; terminal: boolean };

/**
 * Races the planned engines.
 *
 * The rule that makes this fast: **the first engine to succeed wins
 * immediately** and the losers are aborted. Waiting for every engine to
 * settle (the obvious implementation) would make the waterfall exactly as slow
 * as its slowest tier, which defeats the point of running them concurrently.
 *
 * Each engine gets its own child AbortManager, so aborting a loser cannot
 * disturb the winner, and a per-engine timer that fires at its "max reasonable
 * time" — the deadline after which this engine is no longer worth waiting for.
 */
async function raceEngines<E>(
  meta: WaterfallMeta,
  planned: WaterfallEngine<E>[],
  label: string,
): Promise<RaceOutcome<E>> {
  const children = planned.map(() => meta.abort.child());
  const startedAt = Date.now();

  const failures: Array<{ error: unknown; engine: string }> = [];

  let settle: (outcome: RaceOutcome<E>) => void = () => undefined;
  const settled = new Promise<RaceOutcome<E>>((resolve) => {
    settle = resolve;
  });

  const abortOthers = (keepIndex: number): void => {
    children.forEach((child, index) => {
      if (index === keepIndex) return;
      if (!child.aborted) child.abort(new EngineSnipedError());
    });
  };

  planned.forEach((engine, index) => {
    const child = children[index]!;
    const deadline = engine.maxReasonableMs(meta);
    const timer = setTimeout(() => {
      child.abort(new EngineTimeoutError(engine.engine, deadline));
    }, deadline);

    void (async () => {
      try {
        const result = await engine.run({ ...meta, abort: child });
        // First success wins; everyone else is cancelled.
        settle({ status: "ok", result, engine: engine.engine });
        abortOthers(index);
      } catch (error) {
        failures.push({ error, engine: engine.engine });
        // Only when *every* engine has failed is the attempt over.
        if (failures.length === planned.length) {
          const chosen = chooseFailure(failures);
          settle({
            status: "error",
            error: chosen.error,
            engine: chosen.engine,
            terminal: !isStrategyError(chosen.error) &&
              !(chosen.error instanceof EngineRetryableError) &&
              !(chosen.error instanceof EngineTimeoutError),
          });
        }
      } finally {
        clearTimeout(timer);
        child.dispose();
      }
    })();
  });

  const outcome = await settled;

  if (outcome.status === "error") {
    logger.debug(
      {
        label,
        engines: planned.map((engine) => engine.engine),
        elapsedMs: Date.now() - startedAt,
        failures: failures.length,
      },
      "Waterfall attempt exhausted",
    );
  }

  return outcome;
}

/**
 * Picks the error that best explains the failure.
 *
 * A strategy error wins over everything else: it is the only one that tells
 * the waterfall what to do next. After that, a retryable error wins over a
 * terminal one, because retrying is cheap and a terminal error may just be
 * this engine's opinion.
 */
function chooseFailure<E>(
  failures: Array<{ error: unknown; engine: string }>,
): { error: unknown; engine: string } {
  const strategy = failures.find((failure) => isStrategyError(failure.error));
  if (strategy) return strategy;

  const retryable = failures.find(
    (failure) => failure.error instanceof EngineRetryableError,
  );
  if (retryable) return retryable;

  const timeout = failures.find(
    (failure) => failure.error instanceof EngineTimeoutError,
  );
  if (timeout) return timeout;

  const first = failures[0];
  return first ?? { error: new Error("WATERFALL_ALL_SNIPED"), engine: "none" };
}
