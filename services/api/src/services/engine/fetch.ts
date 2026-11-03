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
 *   - the ACE proprietary fire-engine: our own `egressFetch` pool.
 *   - Their native HTML→Markdown: `htmlToMarkdown` (same Turndown approach).
 */

import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import robotsParser, { type Robot } from "robots-parser";
import pdfParse from "pdf-parse";

import { logger } from "../../logger.js";
import { browserHeaders, egressFetch, randomUserAgent } from "./egress.js";
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
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

// ---------------------------------------------------------------------------
// SSRF protection (ACE: scrapeURL/engines/utils/safeFetch.ts)
// ---------------------------------------------------------------------------

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalised = address.toLowerCase();
  if (normalised === "::1" || normalised === "::") return true;
  if (normalised.startsWith("fc") || normalised.startsWith("fd")) return true;
  if (normalised.startsWith("fe80")) return true;
  if (normalised.startsWith("::ffff:")) {
    const mapped = normalised.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIPv4(mapped);
  }
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return false;
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError(`Unsupported protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(hostname)) {
    throw new BlockedUrlError(`Private hostname blocked: ${hostname}`);
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new BlockedUrlError(`Private address blocked: ${hostname}`);
  }
  if (!isIP(hostname)) {
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      for (const record of records) {
        if (isPrivateAddress(record.address)) {
          throw new BlockedUrlError(`Hostname resolves to a private address: ${hostname}`);
        }
      }
    } catch (error) {
      if (error instanceof BlockedUrlError) throw error;
      // DNS failures surface as a normal fetch error; not a security issue.
    }
  }
  return url;
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
    throw new BlockedUrlError(`robots.txt disallows ${url.toString()}`);
  }

  await waitForHost(
    url.host,
    options.polite === false ? 0 : Number(process.env.CRAWL_DELAY_MS ?? 900),
  );

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await egressFetch(
        url.toString(),
        {
          method: "GET",
          headers: browserHeaders({
            "User-Agent": userAgent,
            Referer: url.origin,
            Accept:
              options.accept ??
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
        },
        { preferProxy: options.preferProxy },
      );

      if (RETRY_STATUSES.has(response.status) && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 750 * 2 ** attempt + Math.random() * 500),
        );
        continue;
      }

      const contentType =
        response.headers["content-type"] ??
        response.headers["Content-Type"] ??
        "";
      const finalUrl = response.finalUrl || url.toString();

      // PDF (ACE: scrapeURL/engines/pdf)
      if (contentType.includes("application/pdf")) {
        const parsed = await pdfParse(Buffer.from(response.body));
        const markdown = parsed.text.replace(/\n{3,}/g, "\n\n").trim();
        const result: ScrapeResult = {
          url: url.toString(),
          finalUrl,
          status: response.status,
          contentType,
          html: "",
          markdown,
          metadata: { title: (parsed.info as { Title?: string } | undefined)?.Title },
          jsonLd: null,
          via: response.via,
          fromCache: false,
          looksLikeSpa: false,
        };
        writeCache(cacheKey, result);
        return result;
      }

      const text = decodeBody(response.body, contentType);

      if (contentType.includes("application/json")) {
        const markdown = "```json\n" + text.slice(0, 100_000) + "\n```";
        const result: ScrapeResult = {
          url: url.toString(),
          finalUrl,
          status: response.status,
          contentType,
          html: "",
          markdown,
          metadata: {},
          jsonLd: null,
          via: response.via,
          fromCache: false,
          looksLikeSpa: false,
        };
        writeCache(cacheKey, result);
        return result;
      }

      if (contentType.includes("text/plain") || contentType.includes("text/markdown")) {
        const result: ScrapeResult = {
          url: url.toString(),
          finalUrl,
          status: response.status,
          contentType,
          html: "",
          markdown: text.trim(),
          metadata: {},
          jsonLd: null,
          via: response.via,
          fromCache: false,
          looksLikeSpa: false,
        };
        writeCache(cacheKey, result);
        return result;
      }

      const metadata = extractMetadata(text, finalUrl);
      const jsonLd = extractJobPostingJsonLd(text);
      const markdown = htmlToMarkdown(text, {
        onlyMainContent: options.onlyMainContent,
        includeTags: options.includeTags,
        excludeTags: options.excludeTags,
      });

      const result: ScrapeResult = {
        url: url.toString(),
        finalUrl,
        status: response.status,
        contentType,
        html: text,
        markdown,
        metadata,
        jsonLd,
        via: response.via,
        fromCache: false,
        looksLikeSpa: looksLikeSpa(text),
      };
      writeCache(cacheKey, result);
      return result;
    } catch (error) {
      lastError = error;
      if (error instanceof BlockedUrlError) throw error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 750 * 2 ** attempt + Math.random() * 500),
        );
      }
    }
  }

  logger.warn({ url: rawUrl, error: lastError }, "All scrape attempts failed");
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to scrape ${rawUrl}`);
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
        throw new Error(`HTTP ${response.status} for ${rawUrl}`);
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

  throw lastError instanceof Error ? lastError : new Error(`Fetch failed: ${rawUrl}`);
}

export function clearPageCache(): void {
  pageCache.clear();
  robotsCache.clear();
}
