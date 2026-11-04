/**
 * AI cost tracking.
 *
 * Two properties the naive "sum the tokens at the end" approach lacks:
 *
 *  1. **Fail fast.** A budget overrun throws the moment it happens, not after
 *     the pipeline has already spent the money.
 *  2. **Provenance for free.** Every recorded call captures its call-site
 *     stack, so a bill line is traceable to code without a global register.
 */

export class CostLimitExceededError extends Error {
  constructor(
    readonly limitUsd: number,
    readonly totalUsd: number,
  ) {
    super(`COST_LIMIT_EXCEEDED: ${totalUsd.toFixed(6)} > ${limitUsd.toFixed(6)}`);
    this.name = "CostLimitExceededError";
  }
}

/** USD per million tokens. Add models as we adopt them. */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "openai/gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "nvidia/llama-3.1-nemotron-70b-instruct": { input: 0.35, output: 0.4 },
  "nvidia/llama-3.2-nv-embedqa-1b-v2": { input: 0.02, output: 0 },
};

const warnedModels = new Set<string>();

/** Estimated USD for one call, or `null` when the model is unpriced. */
export function priceCall(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const price = MODEL_PRICES[model];
  if (!price) {
    if (!warnedModels.has(model)) {
      warnedModels.add(model);
      // Never throw: cost estimation must not break a pipeline.
      console.warn(`[cost-tracking] unpriced model: ${model}`);
    }
    return null;
  }
  return (
    (promptTokens * price.input + completionTokens * price.output) / 1_000_000
  );
}

/** Rough token estimate for budgeting before a call (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function nanProof(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export interface CostCall {
  type: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  /** Provide directly when tokens are unknown but the cost is. */
  costUsd?: number;
}

export interface CostSummary {
  totalUsd: number;
  byType: Array<{ type: string; usd: number; calls: number }>;
  calls: number;
  /** Every recorded call, with its captured call-site stack. */
  detail: Array<{ type: string; costUsd: number; stack?: string }>;
}

export class CostTracking {
  private readonly limitUsd: number | undefined;
  private readonly calls: Array<CostCall & { costUsd: number; stack?: string }> = [];
  private total = 0;

  constructor(limitUsd?: number) {
    this.limitUsd =
      limitUsd !== undefined && Number.isFinite(limitUsd) && limitUsd > 0
        ? limitUsd
        : undefined;
  }

  addCall(call: CostCall): void {
    let costUsd = call.costUsd ?? 0;

    if (call.model && (call.promptTokens !== undefined || call.completionTokens !== undefined)) {
      const priced = priceCall(
        call.model,
        call.promptTokens ?? 0,
        call.completionTokens ?? 0,
      );
      if (priced !== null) costUsd = priced;
    }

    costUsd = nanProof(costUsd);
    this.total += costUsd;
    this.calls.push({
      ...call,
      costUsd,
      stack: new Error().stack,
    });

    if (this.limitUsd !== undefined && this.total > this.limitUsd) {
      throw new CostLimitExceededError(this.limitUsd, this.total);
    }
  }

  get totalUsd(): number {
    return this.total;
  }

  get limitUsdOrNull(): number | null {
    return this.limitUsd ?? null;
  }

  toJSON(): CostSummary {
    const byType = new Map<string, { usd: number; calls: number }>();
    for (const call of this.calls) {
      const entry = byType.get(call.type) ?? { usd: 0, calls: 0 };
      entry.usd += call.costUsd;
      entry.calls += 1;
      byType.set(call.type, entry);
    }
    return {
      totalUsd: this.total,
      byType: [...byType.entries()]
        .map(([type, entry]) => ({ type, usd: entry.usd, calls: entry.calls }))
        .sort((a, b) => b.usd - a.usd),
      calls: this.calls.length,
      detail: this.calls.map((call) => ({
        type: call.type,
        costUsd: call.costUsd,
        stack: call.stack,
      })),
    };
  }
}

/** Shared per-process tracker for opportunistic call sites. */
export const costs = new CostTracking(
  Number(process.env.AI_COST_LIMIT_USD ?? 0) || undefined,
);
