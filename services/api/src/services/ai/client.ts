import { config } from "../../config.js";
import { logger } from "../../logger.js";

export type EmbeddingMode = "query" | "passage";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export type AiProviderName = "neon" | "nvidia" | "openai" | "custom";

export interface AiProvider {
  name: AiProviderName;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  embeddingMode: EmbeddingMode;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI_NOT_CONFIGURED");
    this.name = "AiNotConfiguredError";
  }
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

function normaliseBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * The Neon AI Gateway base URL is a **bare host** — the dialect path is ours
 * to append. `/v1` is the unified OpenAI-compatible dialect, which serves
 * both `/v1/chat/completions` and `/v1/embeddings`.
 *
 * Appending the dialect to the host matters: asking the host for
 * `/chat/completions` returns a bare `404 page not found`, which looks like
 * a wrong model rather than a wrong path.
 */
export function neonDialectUrl(host: string): string {
  const base = normaliseBaseUrl(host);
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

function neonProvider(): AiProvider | null {
  if (!config.NEON_AI_GATEWAY_BASE_URL || !config.NEON_AI_GATEWAY_TOKEN) {
    return null;
  }
  return {
    name: "neon",
    baseUrl: neonDialectUrl(config.NEON_AI_GATEWAY_BASE_URL),
    apiKey: config.NEON_AI_GATEWAY_TOKEN,
    chatModel: config.NEON_AI_MODEL,
    embeddingModel: config.NEON_AI_EMBEDDING_MODEL,
    embeddingMode: "passage",
  };
}

function nvidiaProvider(): AiProvider | null {
  if (!config.NVIDIA_API_KEY) return null;
  return {
    name: "nvidia",
    baseUrl: normaliseBaseUrl(config.NVIDIA_BASE_URL),
    apiKey: config.NVIDIA_API_KEY,
    chatModel: config.NVIDIA_MODEL,
    embeddingModel: config.NVIDIA_EMBEDDING_MODEL,
    embeddingMode: "passage",
  };
}

function openAiProvider(): AiProvider | null {
  if (!config.OPENAI_API_KEY) return null;
  return {
    name: "openai",
    baseUrl: normaliseBaseUrl(
      config.AI_BASE_URL ?? "https://api.openai.com/v1",
    ),
    apiKey: config.OPENAI_API_KEY,
    chatModel: config.AI_MODEL,
    embeddingModel: config.AI_EMBEDDING_MODEL,
    embeddingMode: "passage",
  };
}

function customProvider(): AiProvider | null {
  if (!config.AI_BASE_URL || !config.AI_API_KEY) return null;
  return {
    name: "custom",
    baseUrl: normaliseBaseUrl(config.AI_BASE_URL),
    apiKey: config.AI_API_KEY,
    chatModel: config.AI_MODEL,
    embeddingModel: config.AI_EMBEDDING_MODEL,
    embeddingMode: "passage",
  };
}

export function getAiProviders(): AiProvider[] {
  const candidates = [nvidiaProvider(), neonProvider(), openAiProvider(), customProvider()].filter(
    (provider): provider is AiProvider => provider !== null,
  );

  switch (config.AI_PROVIDER) {
    case "neon":
      return candidates.filter((provider) => provider.name === "neon");
    case "nvidia":
      return candidates.filter((provider) => provider.name === "nvidia");
    case "openai":
      return candidates.filter((provider) => provider.name === "openai");
    case "custom":
      return candidates.filter((provider) => provider.name === "custom");
    default:
      return candidates;
  }
}

export function getAiProvider(): AiProvider | null {
  return getAiProviders()[0] ?? null;
}

export function requireAiProvider(): AiProvider {
  const provider = getAiProvider();
  if (!provider) throw new AiNotConfiguredError();
  return provider;
}

export function isAiConfigured(): boolean {
  return getAiProviders().length > 0;
}

/**
 * The chat model the active provider will actually use.
 *
 * Budget reservations must be priced against the model that will answer.
 * Pinning a model name the active provider does not serve (for example
 * asking NVIDIA for `gpt-4.1-mini`) fails with a 404 that reads like a
 * missing model rather than a missing capability.
 */
export function activeChatModel(): string {
  return getAiProvider()?.chatModel ?? config.AI_MODEL;
}

/** The embedding model the active provider will actually use. */
export function activeEmbeddingModel(): string {
  return getAiProvider()?.embeddingModel ?? config.AI_EMBEDDING_MODEL;
}

async function aiRequest(
  provider: AiProvider,
  path: string,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.AI_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AiRequestError(
      error instanceof Error ? error.message : "AI_REQUEST_FAILED",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiRequestError(
      `AI_UPSTREAM_${response.status}: ${detail.slice(0, 200)}`,
      response.status,
    );
  }

  return (await response.json()) as unknown;
}

export interface AiChatResult {
  text: string;
  /** Token counts reported by the provider, when it reports them. */
  promptTokens: number;
  completionTokens: number;
  /** The model that actually answered (may differ from the requested one). */
  model: string;
  provider: AiProviderName;
}

interface ChatMessageShape {
  content?: string | null;
  reasoning_content?: string | null;
}

/**
 * One chat request. `extra` carries provider-specific body fields.
 */
async function requestChat(
  provider: AiProvider,
  model: string,
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number },
  extra?: Record<string, unknown>,
): Promise<unknown> {
  return aiRequest(provider, "/chat/completions", {
    model,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 900,
    ...(extra ?? {}),
  });
}

/**
 * Chat completion with the provider's usage figures.
 *
 * `aiChat` only needs the text, but anything that meters spend needs the
 * token counts: estimating them from character counts is good enough to
 * reserve a budget and bad enough to settle one. So the detailed variant
 * exists, and `aiChat` is a thin wrapper over it.
 */
export async function aiChatDetailed(
  messages: ChatMessage[],
  options: { model?: string; temperature?: number; maxTokens?: number } = {},
): Promise<AiChatResult> {
  const providers = getAiProviders();
  if (providers.length === 0) throw new AiNotConfiguredError();

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const requestedModel = options.model ?? provider.chatModel;
      let payload = await requestChat(provider, requestedModel, messages, options);

      const choices = (payload as {
        choices?: Array<{ message?: ChatMessageShape }>;
      }).choices;
      const message = choices?.[0]?.message;
      let content = message?.content;

      if (!content && message?.reasoning_content) {
        // A reasoning model that spent its whole token budget thinking
        // answers with `content: null` and puts the answer in
        // `reasoning_content`. Ask the same model again with thinking
        // turned off: the work is identical, only the model stops burning
        // the budget before it answers.
        payload = await requestChat(provider, requestedModel, messages, options, {
          chat_template_kwargs: {
            enable_thinking: false,
            force_nonempty_content: true,
          },
        });
        const retried = (payload as {
          choices?: Array<{ message?: ChatMessageShape }>;
        }).choices;
        content = retried?.[0]?.message?.content;
      }

      if (!content) throw new AiRequestError("AI_EMPTY_RESPONSE");

      const usage = (payload as {
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      }).usage;

      return {
        text: content.trim(),
        promptTokens: Number(usage?.prompt_tokens ?? 0),
        completionTokens: Number(usage?.completion_tokens ?? 0),
        model: String(
          (payload as { model?: string }).model ?? requestedModel,
        ),
        provider: provider.name,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiRequestError("AI_REQUEST_FAILED");
}

export async function aiChat(
  messages: ChatMessage[],
  options: { model?: string; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const result = await aiChatDetailed(messages, options);
  return result.text;
}

export async function aiEmbed(
  texts: string[],
  mode: EmbeddingMode = "query",
): Promise<number[][]> {
  const { vectors } = await aiEmbedWithProvider(texts, mode);
  return vectors;
}

/**
 * Embeds one batch with one provider.
 *
 * A provider can reject a *multi-input* batch while accepting single
 * inputs — some embedding deployments fail a batch with a bare
 * `service inference failed`. The work is the same either way, only the
 * request shape changes, so a failed batch is retried one text at a time
 * before the provider is given up on.
 */
async function embedBatchWithProvider(
  provider: AiProvider,
  texts: string[],
  mode: EmbeddingMode,
): Promise<number[][]> {
  const body: Record<string, unknown> = {
    model: provider.embeddingModel,
    input: texts,
  };

  if (provider.name === "nvidia") {
    body.input_type = mode;
    body.truncate = "END";
    body.encoding_format = "float";
  }

  try {
    const payload = await aiRequest(provider, "/embeddings", body);
    const data = (payload as { data?: Array<{ embedding?: number[] }> }).data;
    if (!data?.length) throw new AiRequestError("AI_EMPTY_EMBEDDINGS");
    return data.map((item) => item.embedding ?? []);
  } catch (error) {
    if (texts.length <= 1) throw error;
    logger.debug(
      { error, provider: provider.name, count: texts.length },
      "Embedding batch failed; retrying one text at a time",
    );
    const vectors: number[][] = [];
    for (const text of texts) {
      const single = await embedBatchWithProvider(provider, [text], mode);
      vectors.push(single[0] ?? []);
    }
    return vectors;
  }
}

export async function aiEmbedWithProvider(
  texts: string[],
  mode: EmbeddingMode = "query",
): Promise<{ provider: AiProvider; vectors: number[][] }> {
  const providers = getAiProviders();
  if (providers.length === 0) throw new AiNotConfiguredError();

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const vectors = await embedBatchWithProvider(provider, texts, mode);
      return { provider, vectors };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiRequestError("AI_REQUEST_FAILED");
}
