/**
 * Tiered abort management.
 *
 * A single operation can be aborted for three different reasons: the caller
 * went away, the operation's own budget expired, or an engine racing it in a
 * waterfall won. Those must be distinguishable at the catch site — one is a
 * 499, one is a timeout, one is a normal race outcome — so abort instances
 * carry a tier and the nearest deadline is queryable per tier.
 */

export type AbortTier = "external" | "operation" | "engine";

export interface AbortInstance {
  signal: AbortSignal;
  /** Epoch ms after which this instance has fired. */
  timesOutAt: number;
  tier: AbortTier;
  /** Produced as the abort reason; lets the catch site explain *why*. */
  reason?: () => unknown;
}

export class AbortManagerThrownError extends Error {
  constructor(
    readonly tier: AbortTier,
    readonly inner: unknown,
  ) {
    super(tier === "engine" ? "ENGINE_SNIPED" : "ABORTED");
    this.name = "AbortManagerThrownError";
  }
}

export class AbortManager {
  private controller = new AbortController();
  private instances: AbortInstance[] = [];

  constructor(instances: AbortInstance[] = []) {
    for (const instance of instances) this.add(instance);
  }

  add(instance: AbortInstance): void {
    this.instances.push(instance);
    if (instance.signal.aborted) {
      this.controller.abort(instance.reason?.() ?? instance.tier);
      return;
    }
    instance.signal.addEventListener(
      "abort",
      () => this.controller.abort(instance.reason?.() ?? instance.tier),
      { once: true },
    );
  }

  /** A child manager that is also aborted when this one aborts. */
  child(extra: AbortInstance[] = []): AbortManager {
    const child = new AbortManager(extra);
    if (this.controller.signal.aborted) {
      child.controller.abort(this.controller.signal.reason);
      return child;
    }
    this.controller.signal.addEventListener(
      "abort",
      () => child.controller.abort(this.controller.signal.reason),
      { once: true },
    );
    return child;
  }

  /** Milliseconds until the nearest timeout in a tier, or `null` if none. */
  msUntilNearestTimeout(tier?: AbortTier): number | null {
    let nearest: number | null = null;
    for (const instance of this.instances) {
      if (tier && instance.tier !== tier) continue;
      nearest =
        nearest === null
          ? instance.timesOutAt
          : Math.min(nearest, instance.timesOutAt);
    }
    return nearest === null ? null : Math.max(0, nearest - Date.now());
  }

  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  /** Aborts this manager (and any children) with an explicit reason. */
  abort(reason: unknown): void {
    if (!this.controller.signal.aborted) this.controller.abort(reason);
  }

  asSignal(): AbortSignal {
    return this.controller.signal;
  }

  /** Throws if aborted, carrying the tier and the inner reason. */
  throwIfAborted(): void {
    if (!this.controller.signal.aborted) return;
    const reason = this.controller.signal.reason;
    const tier: AbortTier =
      typeof reason === "string" && ["external", "operation", "engine"].includes(reason)
        ? (reason as AbortTier)
        : "operation";
    throw new AbortManagerThrownError(tier, reason);
  }

  dispose(): void {
    this.instances = [];
  }
}

/** Convenience: an instance that times out after `ms` at a given tier. */
export function timeoutInstance(ms: number, tier: AbortTier = "operation"): AbortInstance {
  return {
    signal: AbortSignal.timeout(ms),
    timesOutAt: Date.now() + ms,
    tier,
    reason: () => new Error(`${tier}_timeout_${ms}ms`),
  };
}
