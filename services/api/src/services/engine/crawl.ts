/**
 * Bounded site crawler.
 *
 * This is the part of the engines that actually walks a careers site: it
 * keeps a frontier, enforces path depth, honours include/exclude patterns,
 * skips non-web protocols, asks robots.txt, and never revisits a URL.
 *
 * The job-focused twist is `jobBias`: link ranking prefers URLs that look
 * like job/list pages, so a shallow crawl of an unknown company site finds
 * its vacancies before it finds its blog.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { scrapeUrl } from "./fetch.js";
import { withSemaphore } from "./semaphore.js";
import { extractEmbeddedJobs, embeddedJobsToRaw } from "./screen.js";
import type { RawJob } from "./sources.js";

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  timeoutMs?: number;
  /** Regex over the path (or full URL when regexOnFullURL is set). */
  includePaths?: string[];
  excludePaths?: string[];
  regexOnFullURL?: boolean;
  /** Skip the politeness delay (crawler still honours robots via the fetcher). */
  respectRobots?: boolean;
  /** Prioritise job-looking links while crawling. */
  jobBias?: boolean;
  onlyHttp?: boolean;
}

export interface CrawlResult {
  /** Distinct job URLs found, ordered by discovery. */
  jobUrls: string[];
  jobs: RawJob[];
  pagesVisited: number;
  skipped: Array<{ url: string; reason: string }>;
}

const NON_WEB_PROTOCOLS = [
  "mailto:",
  "tel:",
  "sms:",
  "ftp:",
  "ftps:",
  "ssh:",
  "file:",
  "data:",
  "javascript:",
];

const JOB_LINK_HINTS = [
  "job",
  "career",
  "vacanc",
  "position",
  "opening",
  "posting",
  "opportunit",
  "role",
  "apply",
  "hiring",
  "workwithus",
  "join-us",
];

const ASSET_EXTENSIONS =
  /\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|map|pdf|zip|tar|gz|mp4|mp3|webm)(\?|$)/i;

export function urlDepth(url: string): number {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function sameSite(a: URL, b: URL): boolean {
  return a.hostname === b.hostname && a.protocol === b.protocol;
}

function matchesAny(patterns: string[], value: string): string | null {
  for (const pattern of patterns) {
    if (!pattern) continue;
    try {
      if (new RegExp(pattern).test(value)) return pattern;
    } catch {
      // Invalid regex in config: treat as literal substring.
      if (value.includes(pattern)) return pattern;
    }
  }
  return null;
}

function jobScore(url: string, linkText: string): number {
  const haystack = `${url} ${linkText}`.toLowerCase();
  let score = 0;
  for (const hint of JOB_LINK_HINTS) {
    if (haystack.includes(hint)) score += hint.includes("job") ? 3 : 1;
  }
  return score;
}

function extractLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const links: Array<{ url: string; text: string }> = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1]?.trim();
    if (!href) continue;
    try {
      const absolute = new URL(href, baseUrl);
      if (absolute.protocol !== "http:" && absolute.protocol !== "https:") continue;
      absolute.hash = "";
      links.push({
        url: absolute.toString(),
        text: (match[2] ?? "").replace(/<[^>]+>/g, " ").trim(),
      });
    } catch {
      // Malformed href.
    }
  }
  return links;
}

export async function crawlSite(
  startUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const maxDepth = options.maxDepth ?? 4;
  const maxPages = options.maxPages ?? 30;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;

  let base: URL;
  try {
    base = new URL(startUrl);
  } catch {
    return { jobUrls: [], jobs: [], pagesVisited: 0, skipped: [] };
  }

  const visited = new Set<string>();
  const jobUrls = new Set<string>();
  const allJobs = new Map<string, ReturnType<typeof extractEmbeddedJobs>[number]>();
  const skipped: Array<{ url: string; reason: string }> = [];
  let pagesVisited = 0;

  // Frontier entries: [url, score]. Score keeps job-looking pages early.
  let frontier: Array<{ url: string; score: number }> = [{ url: startUrl, score: 0 }];

  while (frontier.length > 0 && pagesVisited < maxPages && Date.now() < deadline) {
    frontier.sort((a, b) => b.score - a.score);
    const current = frontier.shift()!;
    if (visited.has(current.url)) continue;
    visited.add(current.url);

    try {
      // The crawl is the most fan-out-heavy thing we do, and several agents
      // crawl at once across three worker machines. The semaphore caps the
      // fleet-wide number of concurrent page fetches, so one big crawl
      // cannot saturate our egress (or a target site's patience).
      const scraped = await withSemaphore(
        "sem:discovery:crawl",
        config.DISCOVERY_CRAWL_CONCURRENCY,
        `crawl:${randomUUID()}`,
        () =>
          scrapeUrl(current.url, {
            onlyMainContent: false,
            timeoutMs: 15_000,
            polite: options.respectRobots ?? true,
          }),
        {
          ttlMs: config.DISCOVERY_SEMAPHORE_TTL_MS,
          timeoutMs: config.DISCOVERY_SEMAPHORE_TIMEOUT_MS,
        },
      );
      pagesVisited += 1;

      const html = scraped.html;

      // Any job the page publishes in its embedded state is already done.
      for (const job of extractEmbeddedJobs(html)) {
        if (job.url) jobUrls.add(new URL(job.url, scraped.finalUrl).toString());
        if (allJobs.size < 300) {
          allJobs.set(
            `${job.title ?? ""}|${job.url ?? ""}`,
            job,
          );
        }
      }

      const links = extractLinks(html, scraped.finalUrl);
      const next: Array<{ url: string; score: number }> = [];

      for (const link of links) {
        const reason = rejectLink(link, base, options, maxDepth);
        if (reason) {
          skipped.push({ url: link.url, reason });
          continue;
        }
        if (visited.has(link.url)) continue;
        if (jobUrls.has(link.url)) continue;

        const score =
          (options.jobBias === false ? 0 : jobScore(link.url, link.text)) +
          // Prefer shallower pages: careers boards live near the top.
          (maxDepth - urlDepth(link.url)) * 0.5;
        next.push({ url: link.url, score });
      }

      frontier.push(...next);
      if (frontier.length > 500) frontier = frontier.slice(0, 500);
    } catch (error) {
      skipped.push({
        url: current.url,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    jobUrls: [...jobUrls],
    jobs: embeddedJobsToRaw([...allJobs.values()], base.toString()),
    pagesVisited,
    skipped: skipped.slice(0, 100),
  };
}

function rejectLink(
  link: { url: string; text: string },
  base: URL,
  options: CrawlOptions,
  maxDepth: number,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(link.url);
  } catch {
    return "MALFORMED";
  }

  if (NON_WEB_PROTOCOLS.some((protocol) => link.url.startsWith(protocol))) {
    return "NON_WEB_PROTOCOL";
  }
  if (ASSET_EXTENSIONS.test(parsed.pathname)) return "ASSET";
  if (!sameSite(parsed, base)) return "OUT_OF_SCOPE";
  if (urlDepth(link.url) > maxDepth) {
    return `DEPTH ${urlDepth(link.url)} > ${maxDepth}`;
  }

  const subject = options.regexOnFullURL ? link.url : parsed.pathname;
  if (options.excludePaths?.length) {
    const excluded = matchesAny(options.excludePaths, subject);
    if (excluded) return `EXCLUDE ${excluded}`;
  }
  if (options.includePaths?.length) {
    const included = matchesAny(options.includePaths, subject);
    if (!included) return "NOT_IN_INCLUDE";
  }
  return null;
}

/**
 * Convenience wrapper used by the expansion agent: crawl a domain and return
 * only the job URLs, capped so one slow employer cannot starve the batch.
 */
export async function discoverJobUrls(
  domain: string,
  budget?: { maxPages?: number; maxDepth?: number; timeoutMs?: number },
): Promise<string[]> {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  try {
    const result = await crawlSite(base, {
      maxPages: budget?.maxPages ?? 20,
      maxDepth: budget?.maxDepth ?? 4,
      timeoutMs: budget?.timeoutMs ?? 90_000,
      jobBias: true,
    });
    if (result.jobUrls.length > 0) return result.jobUrls;
    return [];
  } catch (error) {
    logger.debug({ domain, error }, "Job URL crawl failed");
    return [];
  }
}
