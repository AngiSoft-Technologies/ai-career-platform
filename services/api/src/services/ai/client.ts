import { config } from "../../config.js";

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

function neonProvider(): AiProvider | null {
  if (!config.NEON_AI_GATEWAY_BASE_URL || !config.NEON_AI_GATEWAY_TOKEN) {
    return null;
  }
  return {
    name: "neon",
    baseUrl: normaliseBaseUrl(config.NEON_AI_GATEWAY_BASE_URL),
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
      const payload = await aiRequest(provider, "/chat/completions", {
        model: requestedModel,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 900,
      });

      const choices = (payload as {
        choices?: Array<{ message?: { content?: string } }>;
      }).choices;
      const content = choices?.[0]?.message?.content;
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

export async function aiEmbedWithProvider(
  texts: string[],
  mode: EmbeddingMode = "query",
): Promise<{ provider: AiProvider; vectors: number[][] }> {
  const providers = getAiProviders();
  if (providers.length === 0) throw new AiNotConfiguredError();

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const body: Record<string, unknown> = {
        model: provider.embeddingModel,
        input: texts,
      };

      if (provider.name === "nvidia") {
        body.input_type = mode;
        body.truncate = "END";
        body.encoding_format = "float";
      }

      const payload = await aiRequest(provider, "/embeddings", body);
      const data = (payload as { data?: Array<{ embedding?: number[] }> }).data;
      if (!data?.length) throw new AiRequestError("AI_EMPTY_EMBEDDINGS");
      return {
        provider,
        vectors: data.map((item) => item.embedding ?? []),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiRequestError("AI_REQUEST_FAILED");
}
