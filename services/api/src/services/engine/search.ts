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
 * browser fingerprints, over our own egress with no vendor key.
 */

import * as cheerio from "cheerio";
import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { browserHeaders, egressFetch, searchHeaders } from "./egress.js";
import { decodeBody, fetchJson } from "./fetch.js";
import { reserveDailyQuota } from "./quota.js";
import { unwrapSearchRedirect } from "./redirect.js";

export interface WebSearchResult {
  url: string;
  title: string;
  description: string;
  engine: "searxng" | "googlenews" | "duckduckgo" | "bing";
  /** 1-based position in the final, filtered response. Renumbered by every
   *  filter step so client-facing indexes match persisted analytics. */
  position?: number;
  /** Category attribution, stamped when category filters were requested. */
  category?: string | null;
}

export interface SearchOptions {
  limit?: number;
  country?: string;
  lang?: string;
  freshness?: "day" | "week" | "month" | "year";
  timeoutMs?: number;
  /**
   * A validity gate for the provider chain.
   *
   * The chain is strict-priority: the first provider that returns
   * anything wins. That is the right rule for a general search, and the
   * wrong one for job discovery — where a *news* engine returns
   * something for every query and so shadows the web engines that would
   * have found the posting.
   *
   * A provider whose results all fail the gate is treated as absent, and
   * the next provider is consulted. Results that fail the gate are
   * dropped from a provider that also produced good ones.
   */
  isValidResult?: (result: WebSearchResult) => boolean;
  /**
   * The providers to use, in order.
   *
   * The default is every provider. A caller that knows a provider cannot
   * serve what it is asking for can leave it out — job discovery does
   * exactly that with the news engine, whose results are articles
   * behind a wrapper and never a posting.
   */
  providers?: string[];
}

/** The search providers, in the order the chain prefers them. */
export type SearchProvider =
  | "searxng"
  | "google_news"
  | "duckduckgo"
  | "bing";

/**
 * The chain order.
 *
 * SearXNG first because it is a metasearch: one request reaches several
 * indexes. DuckDuckGo next because it is the engine that answers most
 * job-board queries. Bing next because its HTML result page can come
 * back answering a different question than the one asked, which is why
 * its RSS interface is asked first.
 *
 * The news engine is deliberately *last*. It answers every query, and
 * what it answers with is an article rather than a posting, so a
 * strict-priority chain put it in front of the engines that find the
 * jobs — for days.
 */
const PROVIDER_ORDER: SearchProvider[] = [
  "searxng",
  "duckduckgo",
  "bing",
  "google_news",
];

function selectedProviders(options: SearchOptions): SearchProvider[] {
  const wanted = options.providers
    ?.map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  if (!wanted || wanted.length === 0) return PROVIDER_ORDER;

  const allow = new Set(wanted);
  const selected = PROVIDER_ORDER.filter((provider) => allow.has(provider));
  // An unknown name is a typo, not a request for a provider that does
  // not exist — the caller's other names still apply.
  return selected.length > 0 ? selected : PROVIDER_ORDER;
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
  return unwrapSearchRedirect(href);
}

function parseDdgResults(html: string, seen: Set<string>): WebSearchResult[] {
  const $ = cheerio.load(html);

  // The anti-bot page is served with HTTP 202 and a normal-looking body,
  // so the status code alone does not tell us it failed. The challenge
  // is in the body.
  if ($(".anomaly-modal__modal").length > 0 || /anomaly-modal/i.test(html)) {
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
            ...searchHeaders(
              { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
              antiBotRetries,
            ),
            ...(first
              ? {}
              : { "Content-Type": "application/x-www-form-urlencoded" }),
          },
          body: first ? undefined : body.toString(),
          signal: AbortSignal.timeout(timeoutMs),
        },
        { preferProxy: antiBotRetries > 0 },
      );

      // 202 is how the anti-bot page is served. It is not a success:
      // the body is a challenge, and parsing it yields nothing.
      if (
        response.status === 429 ||
        response.status === 403 ||
        response.status === 202
      ) {
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
  "https://paulgo.io",
  "https://searxng.site",
];

function searxngEndpoints(): { endpoints: string[]; configured: boolean } {
  const configured = process.env.SEARXNG_ENDPOINTS ?? process.env.SEARXNG_ENDPOINT;
  if (configured) {
    return {
      endpoints: configured
        .split(",")
        .map((value) => value.trim().replace(/\/$/, ""))
        .filter(Boolean),
      configured: true,
    };
  }
  return { endpoints: DEFAULT_SEARXNG_ENDPOINTS, configured: false };
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

/**
 * Reads a SearXNG instance through its HTML interface.
 *
 * The JSON interface is the one we would prefer, and it is the one the
 * public instances refuse: nearly every instance answers `format=json`
 * with HTTP 429 — "too many requests" — because JSON output is the
 * expensive feature they ask you not to use, and the one that ignores
 * the format answers with the HTML page instead. The HTML interface is
 * the one they keep open, and it answers with the same results.
 *
 * The request is a POST rather than a GET because that is what the
 * instances answer; a GET is redirected to the front page, which parses
 * as "no results" rather than as an error.
 */
async function searxngInstanceHtml(
  endpoint: string,
  query: string,
  lang: string,
): Promise<WebSearchResult[]> {
  const body = new URLSearchParams({
    q: query,
    language: lang,
    categories: "general",
  }).toString();

  const response = await egressFetch(
    `${endpoint}/search`,
    {
      method: "POST",
      headers: searchHeaders({
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
      }),
      body,
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`SearXNG HTTP ${response.status}`);
  }

  const html = new TextDecoder().decode(response.body);
  const $ = cheerio.load(html);
  const results: WebSearchResult[] = [];

  $("article.result").each((_, block) => {
    const link = $(block).find("h3 a").first();
    if (link.length === 0) return;

    const url = link.attr("href")?.trim() ?? "";
    const title = link.text().trim();
    const description = $(block).find(".content").first().text().trim();
    if (!url.startsWith("http") || !title) return;

    results.push({ url, title, description, engine: "searxng" });
  });

  return results;
}

export async function searxngSearch(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const lang = options.lang ?? "en";
  const { endpoints, configured } = searxngEndpoints();
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  const collect = (attempts: PromiseSettledResult<WebSearchResult[]>[]): boolean => {
    for (const attempt of attempts) {
      if (attempt.status !== "fulfilled") continue;
      for (const result of attempt.value) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        results.push(result);
        if (results.length >= limit) return true;
      }
    }
    return false;
  };

  const html = (batch: string[]) =>
    Promise.allSettled(
      batch.map((endpoint) => searxngInstanceHtml(endpoint, query, lang)),
    );
  const json = (batch: string[]) =>
    Promise.allSettled(
      batch.map((endpoint) => searxngInstance(endpoint, query, 1, lang)),
    );

  // Three instances at a time. They are separate operators' machines and
  // they answer in parallel, so the wall-clock cost is one request — but
  // asking eight of them for every query of every run is the kind of
  // thing that gets a metasearch instance to answer with HTTP 429.
  const first = endpoints.slice(0, 3);
  const second = endpoints.slice(3, 6);

  // An instance the operator configured themselves is their own machine,
  // and the JSON interface is the one to ask: it is structured, and it is
  // the interface their instance has been configured to allow. The public
  // instances are the other way round — they refuse JSON and answer the
  // HTML interface.
  if (configured) {
    if (collect(await json(first))) return results;
    if (collect(await html(first))) return results;
  } else {
    if (collect(await html(first))) return results;
  }

  // The first three can all be down or all rate-limited.
  if (second.length > 0) {
    if (collect(await html(second))) return results;
    if (collect(await json(second))) return results;
  }

  // Last resort: the JSON interface on the first instances, for the
  // public list where it is usually refused.
  if (!configured && collect(await json(first))) return results;

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
      headers: searchHeaders({
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
    const rawHref = link.attr("href")?.trim();
    const title = link.text().trim();
    const description = $(item).find(".b_caption p").first().text().trim();
    if (!rawHref || !title) return;

    // Bing wraps every result in a click-through URL. The wrapper is a
    // redirect *page*, not a redirect, so it has to be decoded here: a
    // crawler that fetches it sees a redirect notice, not the listing.
    const href = unwrapSearchRedirect(rawHref);
    if (seen.has(href)) return;
    if (!href.startsWith("http")) return;
    seen.add(href);
    results.push({ url: href, title, description, engine: "bing" });
  });

  return results.slice(0, limit);
}

/**
 * Reads Bing through its RSS interface.
 *
 * Bing serves two different result sets for the same query, and the
 * HTML one is the wrong one. A query for "data analyst jobs Kenya" came
 * back with results for the word "data" — Wikipedia's data article, IBM's
 * "What is data?", the Merriam-Webster definition — as though only the
 * first word had been searched. The same query through the RSS interface
 * came back with the job boards.
 *
 * The difference is not the query and not the address: the HTML and RSS
 * interfaces were asked the same question, minutes apart, and one
 * answered it and the other did not. Bing's HTML result page carries a
 * large amount of client-side state and can be served in a degraded
 * form; the RSS interface is a plain XML document and does not have
 * that failure mode.
 *
 * So the RSS interface is asked first, and the HTML one is the fallback.
 */
export async function bingRssSearch(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const params = new URLSearchParams({
    q: query,
    format: "rss",
    count: String(Math.max(limit, 20)),
  });

  const response = await egressFetch(
    `https://www.bing.com/search?${params.toString()}`,
    {
      method: "GET",
      headers: searchHeaders({
        Accept: "application/rss+xml,application/xml,text/xml,*/*",
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
    },
    { preferProxy: true },
  );

  if (response.status < 200 || response.status >= 300) return [];

  const xml = new TextDecoder().decode(response.body);
  const $ = cheerio.load(xml, { xmlMode: true });
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();

  $("item").each((_, item) => {
    const url = $(item).find("link").text().trim();
    const title = $(item).find("title").text().trim();
    const description = $(item).find("description").text().trim();
    if (!url.startsWith("http") || !title) return;
    if (seen.has(url)) return;
    seen.add(url);
    results.push({ url, title, description, engine: "bing" });
  });

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Google News RSS (structured, no anti-bot — a stable middle tier)
// ---------------------------------------------------------------------------

export async function googleNewsSearch(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const params = new URLSearchParams({
    q: query,
    hl: options.lang ?? "en",
    gl: (options.country ?? "ke").toUpperCase(),
    ceid: `${(options.country ?? "KE").toUpperCase()}:en`,
  });

  const response = await egressFetch(
    `https://news.google.com/rss/search?${params.toString()}`,
    {
      method: "GET",
      headers: browserHeaders({ Accept: "application/rss+xml,application/xml,text/xml,*/*" }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
    },
  );

  if (response.status < 200 || response.status >= 300) return [];

  const $ = cheerio.load(decodeBody(response.body, "application/xml"), {
    xmlMode: true,
  });
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  $("item").each((_, item) => {
    const title = $(item).find("title").first().text().trim();
    const link = $(item).find("link").first().text().trim();
    const rawDescription = $(item).find("description").first().text().trim();
    // <description> carries HTML markup; strip it for a plain snippet.
    const description = rawDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title || !link || seen.has(link)) return;
    if (!link.startsWith("http")) return;
    seen.add(link);
    results.push({ url: link, title, description, engine: "googlenews" });
  });

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Orchestrator (ported from search/v2/index.ts)
// ---------------------------------------------------------------------------

/**
 * Provider chain with result-validity gates between links. A provider that
 * returns nothing does not merely "fail" — it is treated as absent and the
 * next provider is consulted, so one broken instance never costs the search.
 * Every adapter swallows its own errors, so the chain degrades to "no
 * results" rather than to a 5xx.
 */
/**
 * Runs one provider.
 *
 * The provider registry lives here so the strict chain and the fan-out
 * cannot drift apart: a provider that is added to one and not the other
 * is a provider that works in one mode and not the other, which is
 * exactly the kind of difference nobody notices until a run comes back
 * empty.
 */
async function runSearchProvider(
  provider: SearchProvider,
  query: string,
  options: SearchOptions,
): Promise<WebSearchResult[]> {
  switch (provider) {
    case "searxng":
      return await searxngSearch(query, options);
    case "google_news":
      return await googleNewsSearch(query, options);
    case "duckduckgo":
      return await duckDuckGoSearch(query, options);
    case "bing": {
      // The RSS interface first: Bing's HTML result page can come back
      // in a degraded form that answers a different question, and the
      // RSS one does not have that failure mode.
      const rss = await bingRssSearch(query, options);
      if (rss.length > 0) return rss;
      return await bingSearch(query, options);
    }
  }
}

/**
 * Runs one search provider under the shared daily quota.
 *
 * The quota is per provider, so one provider being rate-limited cannot starve
 * the others. A call that *fails* refunds its unit: no result came back, so
 * no work was done. A call that succeeds — even with zero results — consumed
 * an upstream request and keeps its unit.
 */
async function quotaGuardedSearch(
  provider: string,
  run: () => Promise<WebSearchResult[]>,
): Promise<WebSearchResult[]> {
  const reservation = await reserveDailyQuota(
    "search",
    provider,
    1,
    Number(config.DISCOVERY_DAILY_QUOTA ?? 0) || 1_000,
  );

  if (!reservation.ok) {
    logger.info(
      { provider, used: reservation.used, limit: reservation.limit },
      "Search quota exhausted; provider skipped",
    );
    return [];
  }

  try {
    return await run();
  } catch (error) {
    await reservation.release?.();
    throw error;
  }
}

/**
 * Applies the validity gate to a provider's results.
 *
 * Returns null when the provider has nothing valid — which is the same
 * as the provider being absent, and the chain moves on.
 */
function applyValidityGate(
  results: WebSearchResult[],
  gate: SearchOptions["isValidResult"],
): WebSearchResult[] | null {
  if (!gate) return results;
  const valid = results.filter((result) => gate(result));
  return valid.length > 0 ? valid : null;
}

export async function searchWeb(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const gate = options.isValidResult;

  for (const provider of selectedProviders(options)) {
    try {
      const results = await quotaGuardedSearch(provider, () =>
        runSearchProvider(provider, query, options),
      );
      const accepted = applyValidityGate(results, gate);
      if (accepted) return accepted.slice(0, limit);
    } catch (error) {
      logger.debug({ error, query, provider }, `${provider} unavailable`);
    }
  }

  return [];
}

/**
 * Search every configured engine and merge, for queries where recall matters
 * more than latency (e.g. a new region with no cached results).
 *
 * The merge is round-robin rather than concatenation. Concatenation would
 * let whichever provider answered first fill the whole list, and the
 * point of asking several engines is that any one of them may be blocked,
 * degraded or simply empty for a given query — which is exactly what
 * happened for every query of one discovery run, when DuckDuckGo was
 * answering with an anti-bot page and the chain gave up on the query
 * before it reached the engine that had the answer.
 *
 * A provider that fails takes its place in the rotation and the others
 * carry on, so a blocked engine costs recall and nothing else.
 */
export async function searchWebAll(
  query: string,
  options: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const limit = options.limit ?? 10;
  const providers = selectedProviders(options);

  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const results = await quotaGuardedSearch(provider, () =>
        runSearchProvider(provider, query, options),
      );
      const gate = options.isValidResult;
      return gate ? results.filter((result) => gate(result)) : results;
    }),
  );

  const lists = settled
    .filter(
      (attempt): attempt is PromiseFulfilledResult<WebSearchResult[]> =>
        attempt.status === "fulfilled",
    )
    .map((attempt) => attempt.value);

  const seen = new Set<string>();
  const merged: WebSearchResult[] = [];
  let exhausted = false;

  for (let index = 0; !exhausted && merged.length < limit; index += 1) {
    exhausted = true;
    for (const list of lists) {
      const item = list[index];
      if (!item) continue;
      exhausted = false;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
      if (merged.length >= limit) break;
    }
  }

  return merged;
}
