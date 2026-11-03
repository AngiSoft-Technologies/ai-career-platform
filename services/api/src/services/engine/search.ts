/**
 * Web search — part of the Angisoft Crawling & Extraction Engine (ACE)
 *
 *  *   apps/api/src/search/v2/searxng.ts     (SearXNG JSON client)
 *   apps/api/src/search/v2/index.ts       (provider fallback order)
 *   apps/api/src/search/execute.ts        (result normalisation + dedupe)
 *
 * No search API keys are used. The providers are:
 *   1. SearXNG — free public instances (or our own instance via env).
 *   2. DuckDuckGo HTML — same endpoint ACE scrapes.
 *   3. Bing HTML — last resort.
 *
 * All requests go through our own egress pool (`egressFetch`) and rotate
 * browser fingerprints, exactly like the ACE non-fire-engine path.
 */

import * as cheerio from "cheerio";
import { logger } from "../../logger.js";
import { browserHeaders, egressFetch, randomUserAgent } from "./egress.js";
import { fetchJson } from "./fetch.js";

export interface WebSearchResult {
  url: string;
  title: string;
  description: string;
  engine: "searxng" | "duckduckgo" | "bing";
}

export interface SearchOptions {
  limit?: number;
  country?: string;
  lang?: string;
  freshness?: "day" | "week" | "month" | "year";
  timeoutMs?: number;
}

export class SearchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchBlockedError";
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo (ported from search/v2/ddgsearch.ts)
// ---------------------------------------------------------------------------

function cleanDdgUrl(href: string): string {
  if (!href.includes("uddg=")) return href;
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : href;
  } catch {
    return href;
  }
}

function parseDdgResults(html: string, seen: Set<string>): WebSearchResult[] {
  const $ = cheerio.load(html);
  if ($(".anomaly-modal__modal").length > 0 || /anomaly-modal/.test(html)) {
    throw new SearchBlockedError("DuckDuckGo anti-bot modal");
  }

  const results: WebSearchResult[] = [];
  $(".result.web-result").each((_, block) => {
    const titleLink = $(block).find(".result__a").first();
    const snippet = $(block).find(".result__snippet").first();
    if (titleLink.length === 0 || snippet.length === 0) return;

    const rawUrl = titleLink.attr("href")?.trim();
    const title = titleLink.text().trim();
    const description = snippet.text().trim();
    if (!rawUrl || !title || !description) return;

    const url = cleanDdgUrl(rawUrl);
    if (!url.startsWith("http") || seen.has(url)) return;
    seen.add(url);
    results.push({ url, title, description, engine: "duckduckgo" });
  });
  return results;
}

function nextPageForm(html: string): URLSearchParams | null {
  const $ = cheerio.load(html);
  const next = $('input[type="submit"][value="Next"]').first();
  const form = next.closest("form");
  if (form.length === 0) return null;

  const params = new URLSearchParams();
  form.find("input").each((_, input) => {
    const name = $(input).attr("name");
    const value = $(input).attr("value");
    if (name && value !== undefined) params.set(name, value);
  });
  return params;
}

export async function duckDuckGoSearch(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const lang = options.lang ?? "en";
  const country = options.country ?? "ke";
  const timeoutMs = options.timeoutMs ?? 15_000;

  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  const baseParams = new URLSearchParams({ q: query, kp: "1" });
  baseParams.set("kl", `${country.toLowerCase()}-${lang.toLowerCase()}`);
  if (options.freshness) {
    const df = { day: "d", week: "w", month: "m", year: "y" }[options.freshness];
    baseParams.set("df", df);
  }

  let body: URLSearchParams | null = baseParams;
  let first = true;
  let antiBotRetries = 0;

  while (results.length < limit && body) {
    try {
      const response = await egressFetch(
        first
          ? `https://html.duckduckgo.com/html?${baseParams.toString()}`
          : "https://html.duckduckgo.com/html",
        {
          method: first ? "GET" : "POST",
          headers: {
            ...browserHeaders({ Accept: "text/html,application/xhtml+xml,*/*;q=0.8" }),
            ...(first
              ? {}
              : { "Content-Type": "application/x-www-form-urlencoded" }),
          },
          body: first ? undefined : body.toString(),
          signal: AbortSignal.timeout(timeoutMs),
        },
        { preferProxy: antiBotRetries > 0 },
      );

      if (response.status === 429 || response.status === 403) {
        throw new SearchBlockedError(`DuckDuckGo HTTP ${response.status}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`DuckDuckGo HTTP ${response.status}`);
      }

      const html = new TextDecoder().decode(response.body);
      const page = parseDdgResults(html, seen);
      first = false;
      antiBotRetries = 0;
      results.push(...page);
      if (page.length === 0) break;
      body = nextPageForm(html);
    } catch (error) {
      if (error instanceof SearchBlockedError && antiBotRetries < 3) {
        antiBotRetries += 1;
        // Rotate UA and retry through a different egress IP.
        await new Promise((resolve) => setTimeout(resolve, 1_000 * antiBotRetries));
        continue;
      }
      logger.debug({ error, query }, "DuckDuckGo search failed");
      break;
    }
  }

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// SearXNG (ported from search/v2/searxng.ts)
// ---------------------------------------------------------------------------

const DEFAULT_SEARXNG_ENDPOINTS = [
  "https://searx.be",
  "https://search.inetol.net",
  "https://opnxng.com",
  "https://searx.tiekoetter.com",
  "https://priv.au",
  "https://search.sapti.me",
];

function searxngEndpoints(): string[] {
  const configured = process.env.SEARXNG_ENDPOINTS ?? process.env.SEARXNG_ENDPOINT;
  if (configured) {
    return configured
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }
  return DEFAULT_SEARXNG_ENDPOINTS;
}

interface SearxngResponse {
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
    engine?: string;
  }>;
}

async function searxngInstance(
  endpoint: string,
  query: string,
  page: number,
  lang: string,
): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    language: lang,
    pageno: String(page),
    format: "json",
    categories: "general",
  });

  const payload = await fetchJson<SearxngResponse>(
    `${endpoint}/search?${params.toString()}`,
    { signal: AbortSignal.timeout(12_000) },
  );

  return (payload.results ?? [])
    .map((result) => ({
      url: result.url?.trim() ?? "",
      title: result.title?.trim() ?? "",
      description: result.content?.trim() ?? "",
      engine: "searxng" as const,
    }))
    .filter((result) => result.url.startsWith("http") && result.title);
}

export async function searxngSearch(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const lang = options.lang ?? "en";
  const endpoints = searxngEndpoints();
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  const attempts = await Promise.allSettled(
    endpoints.slice(0, 4).map((endpoint) => searxngInstance(endpoint, query, 1, lang)),
  );

  for (const attempt of attempts) {
    if (attempt.status !== "fulfilled") continue;
    for (const result of attempt.value) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      results.push(result);
      if (results.length >= limit) return results;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Bing HTML (last resort)
// ---------------------------------------------------------------------------

export async function bingSearch(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const params = new URLSearchParams({ q: query, count: String(limit) });

  const response = await egressFetch(
    `https://www.bing.com/search?${params.toString()}`,
    {
      method: "GET",
      headers: browserHeaders({
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": `${options.lang ?? "en"}-US,en;q=0.9`,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    },
    { preferProxy: true },
  );

  if (response.status < 200 || response.status >= 300) return [];

  const $ = cheerio.load(new TextDecoder().decode(response.body));
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();

  $("li.b_algo").each((_, item) => {
    const link = $(item).find("h2 a").first();
    const href = link.attr("href")?.trim();
    const title = link.text().trim();
    const description = $(item).find(".b_caption p").first().text().trim();
    if (!href || !title || seen.has(href)) return;
    if (!href.startsWith("http")) return;
    seen.add(href);
    results.push({ url: href, title, description, engine: "bing" });
  });

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Orchestrator (ported from search/v2/index.ts)
// ---------------------------------------------------------------------------

export async function searchWeb(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;

  try {
    const searx = await searxngSearch(query, options);
    if (searx.length > 0) return searx;
  } catch (error) {
    logger.debug({ error, query }, "SearXNG unavailable");
  }

  try {
    const ddg = await duckDuckGoSearch(query, options);
    if (ddg.length > 0) return ddg.slice(0, limit);
  } catch (error) {
    logger.debug({ error, query }, "DuckDuckGo unavailable");
  }

  try {
    const bing = await bingSearch(query, options);
    if (bing.length > 0) return bing.slice(0, limit);
  } catch (error) {
    logger.debug({ error, query }, "Bing unavailable");
  }

  return [];
}

/**
 * Search every configured engine and merge, for queries where recall matters
 * more than latency (e.g. a new region with no cached results).
 */
export async function searchWebAll(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const settled = await Promise.allSettled([
    searxngSearch(query, options),
    duckDuckGoSearch(query, options),
    bingSearch(query, options),
  ]);

  const seen = new Set<string>();
  const merged: WebSearchResult[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
    }
  }
  return merged;
}
