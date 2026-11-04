/**
 * The fetch waterfall's engines.
 *
 * Two engines, which is all our egress stack honestly has — and the point of
 * the waterfall is not the count, it is the *re-planning*:
 *
 *   • **direct**  — straight out of the node pool. Fastest, cheapest, and the
 *     IP we want to use when we have no reason not to. Wins almost always.
 *   • **proxied** — through the rotating free-proxy pool. Slower and less
 *     reliable, but it has a different IP, so it is the answer to "this site
 *     just rate-limited or fingerprinted that address".
 *
 * Engine selection is **feature-flag driven, not hard-coded**: an engine that
 * hits an anti-bot signal throws `AddFeatureError(["proxied"])` and the whole
 * waterfall re-plans through the proxy tier on the next attempt, without the
 * caller (`scrapeUrl`, the crawler, the agents) knowing anything happened.
 *
 * Support rules:
 *   flags = {}            → [direct, proxied]   (direct starts, proxy shadows it)
 *   flags has "proxied"   → [proxied]
 *   flags has "stealth"   → [proxied]           (stealth *is* the proxy tier
 *                             with a fresh fingerprint; we have no browser
 *                             tier, so escalating again would be a lie)
 */

import { AddFeatureError, EngineRetryableError, type WaterfallEngine, type WaterfallMeta } from "./waterfall.js";
import { browserHeaders, egressFetch } from "./egress.js";
import { decodeBody } from "./fetch.js";
import { processHtmlOffThread } from "./html-worker-host.js";
import type { ScrapeOptions, ScrapeResult } from "./fetch.js";

/** Statuses that mean "this address/tier is not welcome", i.e. change tier. */
const ANTI_BOT_STATUSES = new Set([403, 429]);

/** Statuses that mean "try again", i.e. same tier, transient. */
const RETRY_STATUSES = new Set([408, 425, 500, 502, 503, 504, 520, 521, 522, 524]);

export class AntiBotSignal extends Error {
  constructor(readonly status: number) {
    super(`ANTI_BOT_${status}`);
    this.name = "AntiBotSignal";
  }
}

export interface FetchAttempt {
  url: string;
  options: ScrapeOptions;
  accept: string;
  /** Fresh per attempt so the proxy tier does not reuse a burned identity. */
  userAgent: string;
}

function requestInit(attempt: FetchAttempt): RequestInit {
  return {
    method: "GET",
    headers: browserHeaders({
      "User-Agent": attempt.userAgent,
      Referer: new URL(attempt.url).origin,
      Accept: attempt.accept,
    }),
    signal: AbortSignal.timeout(attempt.options.timeoutMs ?? 25_000),
  };
}

/**
 * Parses a response body into the engine's ScrapeResult (no cache write).
 *
 * The HTML pass runs on a worker thread: converting a large page to
 * Markdown is synchronous and superlinear, and doing it here would block the
 * event loop for minutes — which is exactly what took the background
 * pipeline down once.
 */
async function parseResponse(
  attempt: FetchAttempt,
  response: { status: number; headers: Record<string, string>; body: ArrayBuffer; finalUrl: string; via: string },
  engine: string,
): Promise<ScrapeResult> {
  const contentType = response.headers["content-type"] ?? response.headers["Content-Type"] ?? "";
  const url = attempt.url;
  const finalUrl = response.finalUrl || url;

  const base = {
    url,
    finalUrl,
    status: response.status,
    contentType,
    via: response.via,
    fromCache: false,
  };

  // PDF (routed through the document layer, exactly like the ACE pdf engine).
  if (contentType.includes("application/pdf")) {
    return { ...base, html: "", markdown: "", metadata: {}, jsonLd: null, looksLikeSpa: false, engine };
  }

  const text = decodeBody(response.body, contentType);

  if (contentType.includes("application/json")) {
    return {
      ...base,
      html: "",
      markdown: "```json\n" + text.slice(0, 100_000) + "\n```",
      metadata: {},
      jsonLd: null,
      looksLikeSpa: false,
      engine,
    };
  }

  if (contentType.includes("text/plain") || contentType.includes("text/markdown")) {
    return {
      ...base,
      html: "",
      markdown: text.trim(),
      metadata: {},
      jsonLd: null,
      looksLikeSpa: false,
      engine,
    };
  }

  const processed = await processHtmlOffThread(
    text,
    {
      onlyMainContent: attempt.options.onlyMainContent,
      includeTags: attempt.options.includeTags,
      excludeTags: attempt.options.excludeTags,
    },
    finalUrl,
  );

  return {
    ...base,
    html: text,
    markdown: processed.markdown,
    metadata: processed.metadata,
    jsonLd: processed.jsonLd,
    looksLikeSpa: processed.looksLikeSpa,
    engine,
  };
}

interface EngineDeps {
  attempt: () => FetchAttempt;
  /** The PDF branch needs the caller's parser; injected to avoid a cycle. */
  parsePdf: (bytes: Buffer) => Promise<{ text: string; title?: string }>;
}

function makeEngine(
  name: "direct" | "proxied",
  deps: EngineDeps,
  maxReasonableMs: number,
): WaterfallEngine<ScrapeResult> {
  return {
    engine: name,
    supports(meta: WaterfallMeta): boolean {
      if (meta.featureFlags.has("proxied") || meta.featureFlags.has("stealth")) {
        return name === "proxied";
      }
      return true;
    },
    async run(meta: WaterfallMeta): Promise<ScrapeResult> {
      const attempt = deps.attempt();
      const response = await egressFetch(
        attempt.url,
        requestInit(attempt),
        { preferProxy: name === "proxied" },
      );

      if (ANTI_BOT_STATUSES.has(response.status)) {
        // Record the signal on the shared attempt state even if this engine
        // loses the race: the caller uses it to remember that this host
        // dislikes the direct tier, so the *next* scrape starts proxied.
        const slots = meta.slots as { antiBotHosts?: Set<string> };
        slots.antiBotHosts ??= new Set<string>();
        slots.antiBotHosts.add(new URL(attempt.url).host);

        // The tier is not welcome. Escalate the tier — unless we are already
        // on the last one, in which case this is a genuine transient.
        if (name === "direct" || !meta.featureFlags.has("stealth")) {
          throw new AddFeatureError(
            name === "direct" ? ["proxied"] : ["stealth"],
          );
        }
        throw new EngineRetryableError(`anti-bot ${response.status} on final tier`);
      }

      if (RETRY_STATUSES.has(response.status)) {
        throw new EngineRetryableError(`HTTP ${response.status}`);
      }

      const parsed = await parseResponse(attempt, response, name);

      if (parsed.contentType.includes("application/pdf")) {
        const pdf = await deps.parsePdf(Buffer.from(response.body));
        parsed.markdown = pdf.text.replace(/\n{3,}/g, "\n\n").trim();
        if (pdf.title) parsed.metadata = { title: pdf.title };
      }

      return parsed;
    },
    maxReasonableMs: () => maxReasonableMs,
  };
}

export function buildFetchEngines(deps: EngineDeps): WaterfallEngine<ScrapeResult>[] {
  return [
    // Direct has the shorter MRT: it starts immediately and the proxied
    // engine is already in flight before direct's deadline passes.
    makeEngine("direct", deps, 8_000),
    makeEngine("proxied", deps, 22_000),
  ];
}
