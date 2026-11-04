/**
 * Page fetcher — part of the Angisoft Crawling & Extraction Engine (ACE)
 * safety/robots behaviour of `scrapeURL/index.ts`.
 *
 * What we keep from upstream:
 *   - strict private-network / localhost rejection (SSRF guard)
 *   - charset detection from the Content-Type header *and* <meta charset>
 *   - robots.txt enforcement with a cached parser
 *   - per-host politeness (token bucket + crawl-delay)
 *   - response caching so re-crawls do not hammer a site
 *   - PDF and JSON handling
 *
 * What we replace:
 *   - the upstream proprietary TLS-impersonation engine: our own
 *     `egressFetch` pool, with no vendor key.
 *   - Their native HTML→Markdown: `htmlToMarkdown` (same Turndown approach).
 */

import robotsParser, { type Robot } from "robots-parser";
import pdfParse from "pdf-parse";

import { logger } from "../../logger.js";
import { AbortManager, timeoutInstance } from "../../lib/abort-manager.js";
import { abortableSleep } from "../../lib/retry.js";
import { redactError, redactUrl } from "../../lib/redact.js";
import {
  BlockedUrlError,
  assertPublicUrl as assertPublicUrlStrict,
  isPrivateAddress,
} from "../../lib/net-guard.js";
import { browserHeaders, egressFetch, randomUserAgent } from "./egress.js";
import { buildFetchEngines } from "./fetch-engines.js";
import { runWaterfall, type WaterfallMeta } from "./waterfall.js";
import {
  extractJobPostingJsonLd,
  extractMetadata,
  htmlToMarkdown,
  looksLikeSpa,
  type JsonLdJobPosting,
  type PageMetadata,
} from "./html.js";

export interface ScrapeResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  markdown: string;
  metadata: PageMetadata;
  jsonLd: JsonLdJobPosting | null;
  via: string;
  fromCache: boolean;
  looksLikeSpa: boolean;
  /** Which waterfall engine won (direct | proxied). */
  engine?: string;
}

// ---------------------------------------------------------------------------
// SSRF protection (ACE: scrapeURL/engines/utils/safeFetch.ts)
//
// The rules live in `lib/net-guard.ts`, shared with the source connectors so
// there is exactly one implementation. The only difference here is the DNS
// failure policy: for a scrape, a resolver hiccup is a transient network
// error, not a policy decision, so it is allowed through and surfaces as a
// normal fetch failure instead of being recorded as a blocked URL.
// ---------------------------------------------------------------------------

export { BlockedUrlError, isPrivateAddress };

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  return assertPublicUrlStrict(rawUrl, { onDnsFailure: "allow" });
}

// ---------------------------------------------------------------------------
// Charset decoding (ACE: scrapeURL/engines/fetch/index.ts)
// ---------------------------------------------------------------------------

export function decodeBody(buffer: ArrayBuffer, contentType: string): string {
  const bytes = Buffer.from(buffer);
  const headerCharset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1]?.trim();
  const probe = bytes.toString("utf8");
  const metaCharset = /<meta\b[^>]*charset\s*=\s*["']?([^"'\s/>]+)/i.exec(probe)?.[1]?.trim();

  for (const charset of [headerCharset, metaCharset]) {
    if (!charset) continue;
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // Try the next candidate.
    }
  }
  return probe;
}

// ---------------------------------------------------------------------------
// robots.txt + politeness
// ---------------------------------------------------------------------------

const robotsCache = new Map<string, { robot: Robot | null; expiresAt: number }>();

export async function robotsAllows(url: string, userAgent: string): Promise<boolean> {
  if ((process.env.ROBOTS_TXT_ENFORCED ?? "true") === "false") return true;

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }

  const cached = robotsCache.get(origin);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.robot ? cached.robot.isAllowed(url, userAgent) !== false : true;
  }

  let robot: Robot | null = null;
  try {
    const response = await egressFetch(`${origin}/robots.txt`, {
      method: "GET",
      headers: browserHeaders({ Accept: "text/plain,*/*" }),
    });
    if (response.status >= 200 && response.status < 300) {
      const text = new TextDecoder().decode(response.body);
      robot = robotsParser(`${origin}/robots.txt`, text);
    }
  } catch {
    // ACE allows the fetch when robots.txt cannot be retrieved.
  }

  robotsCache.set(origin, { robot, expiresAt: Date.now() + 60 * 60_000 });
  return robot ? robot.isAllowed(url, userAgent) !== false : true;
}

const hostState = new Map<string, { nextAt: number; crawlDelayMs: number }>();

async function waitForHost(host: string, crawlDelayMs: number): Promise<void> {
  const state = hostState.get(host) ?? { nextAt: 0, crawlDelayMs };
  const now = Date.now();
  const wait = Math.max(0, state.nextAt - now);
  state.nextAt = Math.max(now, state.nextAt) + state.crawlDelayMs;
  hostState.set(host, state);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  expiresAt: number;
  result: ScrapeResult;
}

const pageCache = new Map<string, CacheEntry>();
const PAGE_CACHE_TTL_MS = Number(process.env.PAGE_CACHE_TTL_MS ?? 15 * 60_000);
const PAGE_CACHE_MAX = Number(process.env.PAGE_CACHE_MAX ?? 400);

function readCache(key: string): ScrapeResult | null {
  const entry = pageCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    pageCache.delete(key);
    return null;
  }
  return { ...entry.result, fromCache: true };
}

function writeCache(key: string, result: ScrapeResult): void {
  if (pageCache.size >= PAGE_CACHE_MAX) {
    const oldest = pageCache.keys().next().value;
    if (oldest) pageCache.delete(oldest);
  }
  pageCache.set(key, { expiresAt: Date.now() + PAGE_CACHE_TTL_MS, result });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScrapeOptions {
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  force?: boolean;
  preferProxy?: boolean;
  timeoutMs?: number;
  /** Override the default Accept header (e.g. "application/json"). */
  accept?: string;
  /** Skip the per-host politeness delay (internal hops only). */
  polite?: boolean;
}

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 524]);

/**
 * Hosts that have recently rejected the direct tier.
 *
 * The waterfall escalates to the proxy tier *within* a request, but the next
 * request should not have to learn the same lesson again — a 403 from a
 * careers site is a property of the site, not of the request. This is a
 * small in-process map with a TTL: it is a hint, not a contract, and a
 * process restart simply loses it.
 */
const PROXY_HINT_TTL_MS = 30 * 60 * 1000;
const proxyHints = new Map<string, number>();

function shouldPreferProxy(host: string): boolean {
  const until = proxyHints.get(host);
  if (until === undefined) return false;
  if (until <= Date.now()) {
    proxyHints.delete(host);
    return false;
  }
  return true;
}

function rememberProxyHint(host: string): void {
  proxyHints.set(host, Date.now() + PROXY_HINT_TTL_MS);
}

/** Drops the learned proxy hints. Used by tests and by an operator reset. */
export function clearProxyHints(): void {
  proxyHints.clear();
}

export async function scrapeUrl(
  rawUrl: string,
  options: ScrapeOptions = {},
): Promise<ScrapeResult> {
  const url = await assertPublicUrl(rawUrl);
  const cacheKey = `${options.onlyMainContent === false ? "all" : "main"}:${url.toString()}`;

  if (!options.force) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  const userAgent = randomUserAgent();
  if (!(await robotsAllows(url.toString(), userAgent))) {
    throw new BlockedUrlError("ROBOTS_DISALLOWED", url.toString());
  }

  await waitForHost(
    url.host,
    options.polite === false ? 0 : Number(process.env.CRAWL_DELAY_MS ?? 900),
  );

  // From here on this is a waterfall, not a retry loop: the engines race,
  // anti-bot signals re-plan the feature flags, and only a terminal error
  // from every engine fails the scrape. See `waterfall.ts`.
  //
  // A host we already know dislikes the direct tier starts on the proxy
  // engine, which is the whole point of remembering the signal.
  const preferProxy = options.preferProxy === true || shouldPreferProxy(url.host);
  const meta: WaterfallMeta = {
    url: url.toString(),
    featureFlags: new Set(preferProxy ? ["proxied" as const] : []),
    abort: new AbortManager([
      timeoutInstance(options.timeoutMs ?? 25_000, "operation"),
    ]),
    slots: {},
  };

  let retryCount = 0;
  const outcome = await runWaterfall(
    meta,
    buildFetchEngines({
      attempt: () => ({
        url: url.toString(),
        options,
        accept:
          options.accept ??
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        userAgent,
      }),
      parsePdf: async (bytes) => {
        const parsed = await pdfParse(bytes);
        return {
          text: parsed.text,
          title: (parsed.info as { Title?: string } | undefined)?.Title,
        };
      },
    }),
    {
      label: url.hostname,
      onRetry: async () => {
        retryCount += 1;
        await abortableSleep(750 * 2 ** (retryCount - 1) + Math.random() * 500);
      },
    },
  );

  // The engine already parsed the PDF body and title; nothing to redo here.
  const result: ScrapeResult = { ...outcome.result, engine: outcome.engine };

  // Remember an anti-bot signal even when the fallback tier won the race:
  // the next scrape of this host should start on the proxy engine.
  const antiBotHosts = (meta.slots as { antiBotHosts?: Set<string> })
    .antiBotHosts;
  if (antiBotHosts?.has(url.host)) {
    rememberProxyHint(url.host);
    logger.debug({ host: url.host }, "Host flagged as anti-bot; proxy preferred next time");
  }

  writeCache(cacheKey, result);
  return result;
}

/** Fetches a JSON endpoint with the same safety and egress rules. */
export async function fetchJson<T>(
  rawUrl: string,
  init: RequestInit = {},
): Promise<T> {
  const url = await assertPublicUrl(rawUrl);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await egressFetch(url.toString(), {
        ...init,
        method: init.method ?? "GET",
        headers: {
          ...browserHeaders({ Accept: "application/json,*/*" }),
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: init.signal ?? AbortSignal.timeout(25_000),
      });

      if (RETRY_STATUSES.has(response.status) && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 600 * 2 ** attempt + Math.random() * 400),
        );
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        // The URL can carry a token in its query string; never let it reach an
        // error message that will be logged or shown in the admin UI.
        throw new Error(`HTTP ${response.status} for ${redactUrl(url.toString())}`);
      }
      const text = decodeBody(response.body, "application/json");
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 600 * 2 ** attempt + Math.random() * 400),
        );
      }
    }
  }

  const redacted = redactError(lastError);
  throw new Error(
    lastError instanceof Error
      ? redacted.message
      : `Fetch failed: ${redactUrl(url.toString())}`,
  );
}

export function clearPageCache(): void {
  pageCache.clear();
  robotsCache.clear();
}
