import { query } from "../../db/pool.js";
import { getAiProvider, AiNotConfiguredError } from "../ai/client.js";

export interface AiTaskRecord {
  agent: string;
  model: string;
  provider: string;
  promptVersion: string;
  inputReference?: string;
  outputReference?: string;
  confidence?: number;
  validationResult?: Record<string, unknown>;
  latencyMs?: number;
  tokenUsage?: { prompt?: number; completion?: number; total?: number };
  costUsd?: number;
  status?: "succeeded" | "failed" | "skipped";
  error?: string;
}

export async function recordAiTask(record: AiTaskRecord): Promise<void> {
  try {
    await query(
      `INSERT INTO ai_task_runs (
         agent, model, provider, prompt_version, input_reference, output_reference,
         confidence, validation_result, latency_ms, token_usage, cost_usd, status, error
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        record.agent,
        record.model,
        record.provider,
        record.promptVersion,
        record.inputReference ?? null,
        record.outputReference ?? null,
        record.confidence ?? null,
        JSON.stringify(record.validationResult ?? {}),
        record.latencyMs ?? null,
        JSON.stringify(record.tokenUsage ?? {}),
        record.costUsd ?? null,
        record.status ?? "succeeded",
        record.error ?? null,
      ],
    );
  } catch (error) {
    // Observability must never break the feature it observes.
    console.error("[ai_task] record failed", error instanceof Error ? error.message : error);
  }
}

const COST_PER_MILLION: Record<string, { prompt: number; completion: number }> = {
  "gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "openai/gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
  "nvidia/llama-3.1-nemotron-70b-instruct": { prompt: 0.35, completion: 0.4 },
};

export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates = COST_PER_MILLION[model] ?? { prompt: 0.5, completion: 1.5 };
  return Number(
    (
      (promptTokens / 1_000_000) * rates.prompt +
      (completionTokens / 1_000_000) * rates.completion
    ).toFixed(6),
  );
}

export async function trackAiTask<T>(
  agent: string,
  run: () => Promise<T>,
): Promise<T> {
  const provider = getAiProvider();
  const startedAt = Date.now();

  try {
    const result = await run();
    await recordAiTask({
      agent,
      model: provider?.chatModel ?? "none",
      provider: provider?.name ?? "none",
      promptVersion: "1.0",
      latencyMs: Date.now() - startedAt,
      status: "succeeded",
    });
    return result;
  } catch (error) {
    await recordAiTask({
      agent,
      model: provider?.chatModel ?? "none",
      provider: provider?.name ?? "none",
      promptVersion: "1.0",
      latencyMs: Date.now() - startedAt,
      status: error instanceof AiNotConfiguredError ? "skipped" : "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getAiTaskStats(): Promise<{
  tasks: number;
  failures: number;
  avgLatencyMs: number;
  totalCostUsd: number;
}> {
  const result = await query<{
    tasks: string;
    failures: string;
    avg_latency: string | null;
    total_cost: string | null;
  }>(
    `SELECT count(*)::text AS tasks,
            count(*) FILTER (WHERE status = 'failed')::text AS failures,
            avg(latency_ms)::text AS avg_latency,
            sum(cost_usd)::text AS total_cost
       FROM ai_task_runs
      WHERE created_at > now() - interval '24 hours'`,
  );
  const row = result.rows[0] ?? {
    tasks: "0",
    failures: "0",
    avg_latency: null,
    total_cost: null,
  };
  return {
    tasks: Number(row.tasks),
    failures: Number(row.failures),
    avgLatencyMs: Number(row.avg_latency ?? 0),
    totalCostUsd: Number(row.total_cost ?? 0),
  };
}
