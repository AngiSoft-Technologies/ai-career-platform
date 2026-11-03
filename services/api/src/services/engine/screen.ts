/**
 * Page interaction & capture — no browser required.
 *
 * Our infrastructure is multi-region Fly machines with noChromium, so a real
 * browser engine is not an option for server-side agents. This module gets us
 * the same outcomes by reading what the page already ships to the client:
 *
 *   1. Embedded state     — `__NEXT_DATA__`, `__NUXT__`, Remix/RSC payloads,
 *                           `self.__next_f` chunks, and any `<script>` that
 *                           declares a JSON object. SPA boards put their job
 *                           list in here, which is how we read a page that
 *                           renders "no jobs found" without JavaScript.
 *   2. Hidden endpoints   — inline scripts are scanned for API paths. Careers
 *                           boards fetch `/api/jobs?page=2` or GraphQL; we find
 *                           those endpoints and call them directly.
 *   3. Screen capture     — a deterministic, sanitized snapshot of the page
 *                           (DOM text + links + metrics) stored as evidence.
 *   4. Page interaction   — pagination, filter and query params are driven
 *                           against the discovered endpoints instead of
 *                           clicking. Where a real browser is genuinely
 *                           required, the job seeker's own browser performs
 *                           the action through the automation API.
 */

import { logger } from "../../logger.js";
import { scrapeUrl } from "./fetch.js";
import { htmlToMarkdown } from "./html.js";

export interface PageCapture {
  url: string;
  finalUrl: string;
  status: number;
  title?: string;
  html: string;
  text: string;
  markdown: string;
  links: string[];
  jobs: EmbeddedJob[];
  endpoints: string[];
  stateKeys: string[];
  via: "screen" | "fetch";
}

export interface EmbeddedJob {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string;
  raw?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Embedded state
// ---------------------------------------------------------------------------

const STATE_PATTERNS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i, key: "__NEXT_DATA__" },
  { pattern: /window\.__NUXT__\s*=\s*([\s\S]*?)<\/script>/i, key: "__NUXT__" },
  { pattern: /window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i, key: "__INITIAL_STATE__" },
  { pattern: /window\.__APOLLO_STATE__\s*=\s*([\s\S]*?)<\/script>/i, key: "__APOLLO_STATE__" },
  { pattern: /window\.__remixContext\s*=\s*([\s\S]*?)<\/script>/i, key: "__remixContext" },
];

function parseJsonish(raw: string): unknown {
  const text = raw
    .replace(/^\s*<\//, "")
    .replace(/;?\s*$/, "")
    .replace(/<script[\s\S]*?<\/script>/g, "");
  try {
    return JSON.parse(text);
  } catch {
    // Nuxt emits a function call wrapper; try the `.replace` trick first.
    const match = /\(([\s\S]*)\)\s*;?\s*$/.exec(text);
    if (match?.[1]) {
      try {
        return Function(`"use strict";return (${match[1]})`)();
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function extractEmbeddedState(html: string): {
  state: Record<string, unknown>[];
  keys: string[];
} {
  const state: Record<string, unknown>[] = [];
  const keys: string[] = [];

  for (const { pattern, key } of STATE_PATTERNS) {
    const match = pattern.exec(html);
    if (!match?.[1]) continue;
    const parsed = parseJsonish(match[1]);
    if (parsed && typeof parsed === "object") {
      state.push(parsed as Record<string, unknown>);
      keys.push(key);
    }
  }

  // Any other inline JSON blob (very common in job boards).
  const jsonBlob =
    /<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi;
  let blob: RegExpExecArray | null;
  while ((blob = jsonBlob.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(blob[1]!);
      if (parsed && typeof parsed === "object") {
        state.push(parsed as Record<string, unknown>);
        keys.push("inline-json");
      }
    } catch {
      // Not valid JSON; skip.
    }
  }

  return { state, keys };
}

/** Depth-limited walk that collects every object with job-like keys. */
function walkForJobs(
  node: unknown,
  out: EmbeddedJob[],
  depth = 0,
  seen = new Set<unknown>(),
): void {
  if (depth > 8 || out.length >= 250) return;
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) walkForJobs(item, out, depth + 1, seen);
    return;
  }

  const record = node as Record<string, unknown>;
  const title =
    firstString(record.title) ??
    firstString(record.jobTitle) ??
    firstString(record.position) ??
    firstString(record.name);

  if (title && looksLikeJobRecord(record)) {
    out.push({
      title,
      company:
        firstString(record.company) ??
        firstString(record.companyName) ??
        firstString(record.employer) ??
        (record.company && typeof record.company === "object"
          ? firstString((record.company as Record<string, unknown>).name)
          : undefined) ??
        undefined,
      location:
        firstString(record.location) ??
        firstString(record.jobGeo) ??
        firstString(record.city) ??
        firstString(record.place) ??
        undefined,
      url:
        firstString(record.url) ??
        firstString(record.absolute_url) ??
        firstString(record.applyUrl) ??
        firstString(record.jobUrl) ??
        firstString(record.careers_url) ??
        firstString(record.link) ??
        undefined,
      description: firstString(record.description) ?? firstString(record.summary),
      datePosted:
        firstString(record.datePosted) ??
        firstString(record.posted_at) ??
        firstString(record.pubDate) ??
        firstString(record.created_at) ??
        undefined,
      employmentType:
        firstString(record.employmentType) ?? firstString(record.job_type) ?? undefined,
      raw: record,
    });
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") walkForJobs(value, out, depth + 1, seen);
  }
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

const JOB_KEY_HINTS = [
  "description",
  "location",
  "city",
  "company",
  "employer",
  "apply",
  "salary",
  "posted",
  "published",
  "requisition",
  "vacancy",
  "position",
  "jobtype",
  "employment",
];

function looksLikeJobRecord(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record).join(" ").toLowerCase();
  const hits = JOB_KEY_HINTS.filter((hint) => keys.includes(hint)).length;
  return hits >= 2;
}

export function extractEmbeddedJobs(html: string): EmbeddedJob[] {
  const { state } = extractEmbeddedState(html);
  const jobs: EmbeddedJob[] = [];
  for (const node of state) walkForJobs(node, jobs);
  return dedupe(jobs);
}

function dedupe(jobs: EmbeddedJob[]): EmbeddedJob[] {
  const seen = new Set<string>();
  const out: EmbeddedJob[] = [];
  for (const job of jobs) {
    const key = `${job.title ?? ""}|${job.url ?? ""}|${job.company ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

/**
 * Converts jobs recovered from a page's embedded state into the pipeline's
 * normal shape, so crawlers and screen captures feed the same path as the
 * adapters and ATS board readers.
 */
export function embeddedJobsToRaw(
  jobs: EmbeddedJob[],
  fallbackUrl: string,
  sourcePlatform = "embedded",
): Array<import("./sources.js").RawJob> {
  return jobs
    .filter((job) => job.title)
    .map((job) => {
      let url = fallbackUrl;
      if (job.url) {
        try {
          url = new URL(job.url, fallbackUrl).toString();
        } catch {
          // Keep the fallback.
        }
      }
      const lower = `${job.location ?? ""} ${job.employmentType ?? ""}`.toLowerCase();
      const workMode = lower.includes("hybrid")
        ? ("hybrid" as const)
        : lower.includes("remote") || lower.includes("anywhere")
          ? ("remote" as const)
          : job.location
            ? ("onsite" as const)
            : null;

      return {
        sourcePlatform,
        externalId: url === fallbackUrl ? `${job.title}` : url,
        url,
        applyUrl: url,
        title: job.title!.slice(0, 300),
        company: job.company ?? null,
        description: job.description?.slice(0, 12_000) ?? "",
        location: job.location ?? null,
        country: null,
        city: job.location ?? null,
        workMode,
        employmentType: job.employmentType
          ? job.employmentType.toLowerCase().replace(/-/g, "_")
          : null,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: job.datePosted
          ? (Number.isNaN(new Date(job.datePosted).getTime())
              ? null
              : new Date(job.datePosted))
          : null,
        skills: [],
      } satisfies import("./sources.js").RawJob;
    });
}

// ---------------------------------------------------------------------------
// Hidden endpoints
// ---------------------------------------------------------------------------

const ENDPOINT_PATTERN =
  /["'`]((?:\/|https?:\/\/[^"'`\s]+)\/(?:api|graphql|wp-json|v1|v2|search|jobs?|vacanc\w*|positions?|postings?)\b[^"'`\s]*)/gi;

const EXCLUDE =
  /\.(css|js|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|map)(\?|$)|google|fonts|cdn\.|analytics|gtag|pixel/i;

export function discoverEndpoints(html: string, baseUrl: string): string[] {
  const endpoints = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ENDPOINT_PATTERN.exec(html)) !== null) {
    const raw = match[1]!;
    if (EXCLUDE.test(raw)) continue;
    let absolute: string;
    try {
      absolute = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    if (!absolute.startsWith("http")) continue;
    endpoints.add(absolute);
  }

  return [...endpoints].slice(0, 40);
}

// ---------------------------------------------------------------------------
// Page capture (the "screenshot" equivalent — deterministic evidence)
// ---------------------------------------------------------------------------

export async function capturePage(
  rawUrl: string,
  options: { maxJobs?: number; includeEndpoints?: boolean } = {},
): Promise<PageCapture> {
  const scraped = await scrapeUrl(rawUrl, { onlyMainContent: false });
  const html = scraped.html;
  const markdown = htmlToMarkdown(html, { onlyMainContent: false });
  const { keys } = extractEmbeddedState(html);
  const jobs = extractEmbeddedJobs(html).slice(0, options.maxJobs ?? 60);
  const endpoints = options.includeEndpoints
    ? discoverEndpoints(html, scraped.finalUrl)
    : [];

  const links = [
    ...new Set(
      [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)]
        .map((match) => match[1]!)
        .filter((href) => href && !href.startsWith("#") && !href.startsWith("javascript:")),
    ),
  ].slice(0, 300);

  return {
    url: rawUrl,
    finalUrl: scraped.finalUrl,
    status: scraped.status,
    title: scraped.metadata.title,
    html: html.slice(0, 400_000),
    text: markdown.slice(0, 40_000),
    markdown: markdown.slice(0, 20_000),
    links,
    jobs,
    endpoints,
    stateKeys: keys,
    via: "screen",
  };
}

/**
 * Follows a discovered endpoint to pull the *next page* of a job board. This
 * is the pagination mechanism that replaces "click next page": we ask the
 * board's own API directly.
 */
export async function fetchEndpointPage<T>(
  endpoint: string,
  page: number,
): Promise<T | null> {
  const url = new URL(endpoint);
  if (!url.searchParams.has("page") && !/page/i.test(endpoint)) {
    url.searchParams.set("page", String(page));
  } else {
    url.searchParams.set("page", String(page));
  }

  try {
    const scraped = await scrapeUrl(url.toString(), {
      onlyMainContent: false,
      accept: "application/json",
    });
    const text = scraped.markdown;
    if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    logger.debug({ endpoint, page, error }, "Endpoint pagination failed");
    return null;
  }
}

/**
 * Determines whether a "0 jobs" page is really empty or just unrendered, so
 * we do not discard a site that hides its listings behind JavaScript.
 */
export function pageHasJobsSignal(html: string, text: string): boolean {
  if (/\bno (?:jobs?|vacancies|openings|results|found)\b/i.test(text)) return false;
  return (
    extractEmbeddedJobs(html).length > 0 ||
    /\b(\d+)\s+job/i.test(text) ||
    /itemprop=["']job\b/i.test(html)
  );
}
