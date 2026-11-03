/**
 * HTML processing — ported and adapted from ACE (AGPL-3.0).
 *
 *  *   apps/api/src/scraper/scrapeURL/lib/removeUnwantedElements.ts
 *   apps/api/src/scraper/scrapeURL/lib/extractMetadata.ts
 *
 * We keep the same structure (cheerio cleanup → Turndown + GFM) because it is
 * battle-tested against real job boards. The only changes are that we do not
 * depend on the ACE Rust/Go native helpers, and we add job-specific
 * structured-data extraction (schema.org JobPosting).
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { gfm } from "joplin-turndown-plugin-gfm";

const NON_MAIN_SELECTORS = [
  "header",
  "footer",
  "nav",
  "aside",
  ".header",
  ".top",
  ".navbar",
  "#header",
  ".footer",
  ".bottom",
  "#footer",
  ".sidebar",
  ".side",
  ".aside",
  "#sidebar",
  ".modal",
  ".popup",
  "#modal",
  ".overlay",
  ".ad",
  ".ads",
  ".advert",
  "#ad",
  ".lang-selector",
  ".language",
  "#language-selector",
  ".social",
  ".social-media",
  ".social-links",
  "#social",
  ".menu",
  ".navigation",
  "#nav",
  ".breadcrumbs",
  "#breadcrumbs",
  ".share",
  "#share",
  ".widget",
  "#widget",
  ".cookie",
  "#cookie",
  '[aria-label="Cookie consent" i]',
  ".grecaptcha-badge",
  '[data-original-tag="iframe"][src*="google.com/recaptcha/"]',
  '[data-original-tag="iframe"][src*="recaptcha.net/recaptcha/"]',
  '[data-original-tag="iframe"][src*="hcaptcha.com"]',
  '[data-original-tag="iframe"][src*="challenges.cloudflare.com"]',
];

const FORCE_INCLUDE = ["#main", "main", "[role=main]", "article"];

function makeTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  // the ACE inlineLink rule.
  service.addRule("inlineLink", {
    filter: (node, options) =>
      options.linkStyle === "inlined" &&
      node.nodeName === "A" &&
      Boolean(node.getAttribute("href")),
    replacement: (content, node) => {
      const href = node.getAttribute("href");
      const title = node.getAttribute("title")
        ? ` "${node.getAttribute("title")}"`
        : "";
      return `[${content.trim()}](${href}${title})`;
    },
  });

  service.use(gfm);
  return service;
}

const turndown = makeTurndown();

export interface CleanOptions {
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
}

/**
 * Removes chrome (nav/footer/ads/cookie banners) before conversion.
 * Adapted from the ACE `htmlTransform` fallback path.
 */
export function cleanHtml(html: string, options: CleanOptions = {}): string {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, canvas, iframe, meta, head, link").remove();
  $("*").each((_, element) => {
    const attribs = (element as { attribs?: Record<string, string> }).attribs;
    if (!attribs) return;
    for (const name of Object.keys(attribs)) {
      if (name.startsWith("on") || name === "style") {
        $(element).removeAttr(name);
      }
    }
  });

  if (options.onlyMainContent !== false) {
    for (const selector of NON_MAIN_SELECTORS) {
      try {
        $(selector).remove();
      } catch {
        // Some selectors are not valid in older cheerio builds; skip.
      }
    }
  }

  for (const tag of options.excludeTags ?? []) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    try {
      $(trimmed).remove();
    } catch {
      // Ignore malformed selectors supplied through agent config.
    }
  }

  if ((options.includeTags ?? []).filter((tag) => tag.trim()).length > 0) {
    const selected = cheerio.load("<div></div>")("div");
    for (const tag of options.includeTags ?? []) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      try {
        $(trimmed).each((_, element) => {
          selected.append($(element).clone());
        });
      } catch {
        // Ignore malformed selectors.
      }
    }
    return selected.html() ?? "";
  }

  // Keep the main article when the page clearly exposes one.
  for (const selector of FORCE_INCLUDE) {
    try {
      const main = $(selector).first();
      if (main.length > 0 && main.text().trim().length > 200) {
        return main.html() ?? $.html();
      }
    } catch {
      // Ignore.
    }
  }

  return $("body").html() ?? $.html();
}

export function htmlToMarkdown(html: string, options: CleanOptions = {}): string {
  if (!html || !html.trim()) return "";
  const cleaned = cleanHtml(html, options);
  let markdown: string;
  try {
    markdown = turndown.turndown(cleaned);
  } catch {
    markdown = cleaned.replace(/<[^>]+>/g, " ");
  }
  return postProcessMarkdown(markdown);
}

/**
 * ACE runs this in their native layer; the JS equivalent keeps the same
 * shape: collapse whitespace, drop empty links/images, normalise list spacing.
 */
export function postProcessMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/!\[\]\([^)]*\)/g, "")
    .replace(/\[\]\([^)]*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface PageMetadata {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogSiteName?: string;
  canonical?: string;
  language?: string;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}

function metaContent(
  $: cheerio.CheerioAPI,
  ...selectors: string[]
): string | undefined {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content")?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Ported from the ACE `extractMetadata` cheerio fallback. */
export function extractMetadata(html: string, url?: string): PageMetadata {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim() || undefined;
  const description = metaContent($, 'meta[name="description"]');
  const ogTitle = metaContent($, 'meta[property="og:title"]');
  const ogDescription = metaContent($, 'meta[property="og:description"]');
  const ogImageRaw = metaContent(
    $,
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  );
  const ogSiteName = metaContent($, 'meta[property="og:site_name"]');
  const canonicalRaw =
    $('link[rel="canonical"]').first().attr("href")?.trim() || undefined;
  const language = $("html").attr("lang")?.trim() || undefined;
  const publishedTime = metaContent(
    $,
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]',
  );
  const modifiedTime = metaContent(
    $,
    'meta[property="article:modified_time"]',
    'meta[name="last-modified"]',
  );
  const author = metaContent($, 'meta[name="author"]');

  const resolve = (value: string | undefined): string | undefined => {
    if (!value || !url) return value;
    try {
      return new URL(value, url).toString();
    } catch {
      return value;
    }
  };

  return {
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage: resolve(ogImageRaw),
    ogSiteName,
    canonical: resolve(canonicalRaw),
    language,
    publishedTime,
    modifiedTime,
    author,
  };
}

export interface JsonLdJobPosting {
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  city?: string;
  country?: string;
  employmentType?: string;
  workMode?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  datePosted?: string;
  validThrough?: string;
  applyUrl?: string;
}

function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = record.name ?? record["@value"];
    if (typeof name === "string") return name.trim() || undefined;
  }
  return undefined;
}

function flattenJsonLd(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) flattenJsonLd(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record["@graph"])) {
    flattenJsonLd(record["@graph"], out);
  }
  out.push(record);
}

/**
 * Reads every schema.org JobPosting block on a page. Job *listing* pages
 * (careers indexes, ATS boards) often publish many postings at once, so the
 * array form is what the expansion agent uses.
 */
export function extractJobPostingsJsonLd(html: string): JsonLdJobPosting[] {
  const $ = cheerio.load(html);
  const nodes: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw || !raw.trim()) return;
    try {
      flattenJsonLd(JSON.parse(raw), nodes);
    } catch {
      // Some sites emit invalid JSON-LD; ignore that block.
    }
  });

  return nodes
    .filter((node) => {
      const type = node["@type"];
      if (typeof type === "string") return type === "JobPosting";
      return Array.isArray(type) && type.includes("JobPosting");
    })
    .map(parseJobPostingNode);
}

function parseJobPostingNode(posting: Record<string, unknown>): JsonLdJobPosting {
  const company =
    textOf(posting.hiringOrganization) ??
    textOf((posting.hiringOrganization as Record<string, unknown>)?.name);

  const locations = posting.jobLocation;
  const locationNode = Array.isArray(locations) ? locations[0] : locations;
  const address =
    locationNode && typeof locationNode === "object"
      ? (locationNode as Record<string, unknown>).address
      : undefined;
  const addressRecord =
    address && typeof address === "object"
      ? (address as Record<string, unknown>)
      : undefined;

  const city = textOf(addressRecord?.addressLocality);
  const country = textOf(addressRecord?.addressCountry);
  const locationRaw =
    [
      textOf(addressRecord?.addressLocality),
      textOf(addressRecord?.addressRegion),
      country,
    ]
      .filter(Boolean)
      .join(", ") || undefined;

  const salary =
    posting.baseSalary && typeof posting.baseSalary === "object"
      ? (posting.baseSalary as Record<string, unknown>)
      : undefined;
  const salaryValue =
    salary?.value && typeof salary.value === "object"
      ? (salary.value as Record<string, unknown>)
      : undefined;
  const salaryMin = Number(salaryValue?.minValue ?? salaryValue?.value);
  const salaryMax = Number(salaryValue?.maxValue ?? salaryValue?.value);

  const employmentTypeRaw = posting.employmentType;
  const employmentType = Array.isArray(employmentTypeRaw)
    ? textOf(employmentTypeRaw[0])
    : textOf(employmentTypeRaw);

  const descriptionRaw = textOf(posting.description);
  const description = descriptionRaw
    ? htmlToMarkdown(descriptionRaw, { onlyMainContent: false })
    : undefined;

  const applyUrl =
    textOf(posting.url) ??
    textOf(posting.applicationContact) ??
    textOf(posting.sameAs);

  return {
    title: textOf(posting.title),
    description,
    company,
    location: locationRaw,
    city,
    country,
    employmentType,
    datePosted: textOf(posting.datePosted),
    validThrough: textOf(posting.validThrough),
    applyUrl,
    salaryMin: Number.isFinite(salaryMin) ? salaryMin : undefined,
    salaryMax: Number.isFinite(salaryMax) ? salaryMax : undefined,
    currency: textOf(salary?.currency),
  };
}

/** Back-compat helper: the first JobPosting on the page. */
export function extractJobPostingJsonLd(html: string): JsonLdJobPosting | null {
  return extractJobPostingsJsonLd(html)[0] ?? null;
}

/** Detects pages that only render their content with JavaScript. */
export function looksLikeSpa(html: string): boolean {
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return bodyText.length < 400 && /<script/i.test(html);
}
