/**
 * HTML processing — ported and adapted from ACE (AGPL-3.0).
 *
 *  *   apps/api/src/scraper/scrapeURL/lib/removeUnwantedElements.ts
 *  *   apps/api/src/scraper/scrapeURL/lib/extractMetadata.ts
 *
 * We keep the same structure (cheerio cleanup → Turndown + GFM) because it is
 * battle-tested against real job boards. The only changes are that we do not
 * depend on the ACE Rust/Go native helpers, and we add job-specific
 * structured-data extraction (schema.org JobPosting).
 *
 * ---------------------------------------------------------------------------
 * Why every step here is bounded
 *
 * The production pipeline died once because of this file. A single 3 MB page
 * took **71 seconds** inside Turndown, and because Turndown is synchronous it
 * blocked the event loop for the whole time. The worker that was running it
 * could not answer Redis, could not renew a lease, could not fire its own
 * deadline — the whole background pipeline went quiet with no error anywhere.
 *
 * Turndown's cost is superlinear in the size of the document it is given:
 * measured on this machine, 512 KB → 1.9 s, 1 MB → 6.8 s, 3 MB → 66 s. The
 * same page was parsed three times over (once for the markdown, once for the
 * metadata, once for the JSON-LD), so the real cost was worse still.
 *
 * So this module is built around three rules:
 *
 *  1. **Parse the document once.** Metadata and JSON-LD do not need a DOM —
 *     they are attributes and script blocks — so they are read with cheap
 *     scanners and the DOM is used only for the cleanup that genuinely needs
 *     it.
 *  2. **Never hand Turndown a document it cannot chew.** Above a size cap the
 *     conversion falls back to a linear text extraction, which is enough for
 *     job extraction and cannot take minutes.
 *  3. **Strip the weight before parsing.** Scripts, styles and embeds are
 *     removed with a linear scanner before the document is truncated, so the
 *     cap is applied to content rather than to inline application state.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { gfm } from "joplin-turndown-plugin-gfm";

/**
 * Largest document we will parse. Above this the page is chrome, not a job
 * posting, and parsing it costs more than it is worth.
 *
 * Measured on this machine: parsing 1 MB of element-dense markup with
 * cheerio costs about 1.5 seconds. The work is done on a worker thread, so
 * it costs the page and nothing else — but the page still has to be read, so
 * the budget is kept where the marginal content stops being worth anything.
 */
export const MAX_HTML_BYTES = 1_000_000;

/**
 * Largest cleaned document we will hand to Turndown.
 *
 * Turndown is the expensive step and it is superlinear, so the cap is set
 * where the cost is still trivial: 256 KB converts in well under a second.
 */
export const MAX_MARKDOWN_HTML_BYTES = 256_000;

/**
 * Largest Markdown we will produce.
 *
 * Nothing downstream reads more than the first 12 000 characters of a
 * description, so a megabyte of Markdown is pure weight — in the cache, in
 * memory, and in the comparison the change judge has to make.
 */
export const MAX_MARKDOWN_CHARS = 200_000;

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

/** Elements whose *content* is weight rather than information. */
const HEAVY_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
] as const;

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

/** Everything one page yields, in one pass over the document. */
export interface HtmlProcessingResult {
  markdown: string;
  metadata: PageMetadata;
  jsonLd: JsonLdJobPosting | null;
  looksLikeSpa: boolean;
}

// ---------------------------------------------------------------------------
// Linear scanners
//
// Everything in this section is O(n) in the size of the input and never
// builds a DOM. It exists so that the expensive DOM work happens at most
// once per page, and so that a fallback path exists that cannot itself
// become the thing that hangs the process.
// ---------------------------------------------------------------------------

/**
 * Removes the content of heavy elements, plus comments.
 *
 * A linear scanner rather than a regular expression: the obvious regex
 * (`<script[\s\S]*?</script>`) is quadratic when a page has many opening
 * tags without matching closing tags, which is exactly what a truncated or
 * hostile document looks like.
 */
export function stripHeavyMarkup(html: string): string {
  let out = removeComments(html);

  for (const tag of HEAVY_TAGS) {
    out = removeTagBlocks(out, tag);
  }
  return out;
}

function removeComments(html: string): string {
  let result = "";
  let cursor = 0;
  for (;;) {
    const start = html.indexOf("<!--", cursor);
    if (start === -1) break;
    const end = html.indexOf("-->", start + 4);
    result += html.slice(cursor, start);
    if (end === -1) {
      cursor = html.length;
      break;
    }
    cursor = end + 3;
  }
  return result + html.slice(cursor);
}

function removeTagBlocks(html: string, tag: string): string {
  const open = new RegExp(`<${tag}\\b`, "gi");
  const closeTag = `</${tag}`;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = open.exec(html)) !== null) {
    const start = match.index;
    if (start < cursor) continue;

    const gt = html.indexOf(">", start);
    if (gt === -1) break;

    // A self-closing tag (`<script/>`) has no content: skip just the tag.
    if (html[gt - 1] === "/") {
      result += html.slice(cursor, gt + 1);
      cursor = gt + 1;
      open.lastIndex = cursor;
      continue;
    }

    const close = html.toLowerCase().indexOf(closeTag, gt);
    result += html.slice(cursor, start);
    if (close === -1) {
      // Unclosed: everything after it belongs to the element.
      cursor = html.length;
      break;
    }
    const closeEnd = html.indexOf(">", close);
    cursor = closeEnd === -1 ? html.length : closeEnd + 1;
    open.lastIndex = cursor;
  }

  return result + html.slice(cursor);
}

/**
 * Cuts a document at a tag boundary.
 *
 * Cutting mid-tag produces markup that the parser has to guess about, so the
 * cut is placed after the last complete tag inside the budget.
 */
export function truncateHtml(html: string, maxBytes: number): string {
  if (html.length <= maxBytes) return html;
  const slice = html.slice(0, maxBytes);
  const lastTagEnd = slice.lastIndexOf(">");
  if (lastTagEnd <= 0) return slice;
  return slice.slice(0, lastTagEnd + 1);
}

const BLOCK_TAG_NAMES = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "br",
  "hr",
  "pre",
  "blockquote",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "form",
  "fieldset",
  "legend",
  "details",
  "summary",
  "address",
]);

/**
 * Linear HTML→text conversion.
 *
 * This is the fallback whenever the expensive path is not affordable. It
 * keeps block structure (a line break per block element) and drops the rest.
 * Job extraction only needs the words, so this is a faithful enough reading
 * of a page — and it cannot take more than a few hundred milliseconds.
 */
export function fastTextFromHtml(html: string): string {
  const text = html
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_match, name: string) =>
      BLOCK_TAG_NAMES.has(name.toLowerCase()) ? "\n" : " ",
    )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return decodeEntities(text).trim();
}

/** Reads the attributes of a single tag. */
function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    attributes[name] = decodeEntities(value);
  }
  return attributes;
}

/** All occurrences of a void/self-closing tag, as raw tag text. */
function findTags(html: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    found.push(match[0]);
  }
  return found;
}

const ENTITY_RE =
  /&(#\d+|#[xX][0-9a-fA-F]+|nbsp|amp|lt|gt|quot|apos);/g;

/**
 * Decodes the handful of entities that matter, in a single pass.
 *
 * A single pass matters: decoding `&` before `<` would turn
 * `&lt;` into `<`, which is a different thing from the text the page
 * actually contains.
 */
export function decodeEntities(value: string): string {
  return value.replace(ENTITY_RE, (match, entity: string) => {
    const key = entity.toLowerCase();
    switch (key) {
      case "nbsp":
        return " ";
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        const code = key.startsWith("#x")
          ? Number.parseInt(key.slice(2), 16)
          : Number.parseInt(key.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Removes chrome (nav/footer/ads/cookie banners) before conversion.
 * Adapted from the ACE `htmlTransform` fallback path.
 *
 * The input is bounded before it is parsed: the DOM is the expensive part,
 * and a document this large is not a job posting.
 */
export function cleanHtml(html: string, options: CleanOptions = {}): string {
  const $ = cheerio.load(
    truncateHtml(stripHeavyMarkup(html), MAX_HTML_BYTES),
  );

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

/**
 * Converts HTML to Markdown, with a size guard.
 *
 * Above `MAX_MARKDOWN_HTML_BYTES` the conversion falls back to a linear text
 * extraction. This is the guard that keeps a pathological page from taking
 * the process down with it.
 */
export function htmlToMarkdown(html: string, options: CleanOptions = {}): string {
  if (!html || !html.trim()) return "";
  const cleaned = cleanHtml(html, options);
  if (cleaned.length > MAX_MARKDOWN_HTML_BYTES) {
    return postProcessMarkdown(fastTextFromHtml(cleaned));
  }
  let markdown: string;
  try {
    markdown = turndown.turndown(cleaned);
  } catch {
    markdown = fastTextFromHtml(cleaned);
  }
  return postProcessMarkdown(markdown);
}

/**
 * ACE runs this in their native layer; the JS equivalent keeps the same
 * shape: collapse whitespace, drop empty links/images, normalise list spacing.
 */
export function postProcessMarkdown(markdown: string): string {
  const cleaned = markdown
    .replace(/\r\n/g, "\n")
    .replace(/!\[\]\([^)]*\)/g, "")
    .replace(/\[\]\([^)]*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > MAX_MARKDOWN_CHARS
    ? cleaned.slice(0, MAX_MARKDOWN_CHARS)
    : cleaned;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

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

/**
 * Reads the metadata of a page.
 *
 * Ported from the ACE `extractMetadata` cheerio fallback, but implemented as
 * a scanner: a page's metadata lives in a handful of tags, and reading them
 * does not justify a second parse of the whole document.
 */
export function extractMetadata(html: string, url?: string): PageMetadata {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const title = titleMatch
    ? decodeEntities(titleMatch[1] ?? "").replace(/\s+/g, " ").trim()
    : "";

  const metaTags = findTags(html, "meta");
  const byName = new Map<string, string>();
  for (const tag of metaTags) {
    const attributes = parseAttributes(tag);
    const content = attributes["content"];
    if (content === undefined) continue;

    // OpenGraph's own spelling comes first.
    //
    // "<meta name='title' property='og:title' content='Careers | Renault
    // Group'>" is an OpenGraph tag that also happens to carry a name.
    // Reading the name first hid the tag behind its own alias, and the
    // employer's name — which is written only there — was lost.
    const property = attributes["property"];
    const name = attributes["name"];
    const keys: string[] = [];
    if (property) keys.push(property);
    if (name && name !== property) keys.push(name);

    for (const key of keys) {
      const lower = key.toLowerCase();
      if (!byName.has(lower)) byName.set(lower, content);
    }
  }

  const linkTags = findTags(html, "link");
  let canonical: string | undefined;
  for (const tag of linkTags) {
    const attributes = parseAttributes(tag);
    const rel = (attributes["rel"] ?? "").toLowerCase();
    if (rel.split(/\s+/).includes("canonical") && attributes["href"]) {
      canonical = attributes["href"];
      break;
    }
  }

  const htmlTag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  const language = parseAttributes(htmlTag)["lang"]?.trim() || undefined;

  const resolve = (value: string | undefined): string | undefined => {
    if (!value || !url) return value;
    try {
      return new URL(value, url).toString();
    } catch {
      return value;
    }
  };

  return {
    title: title || undefined,
    description: byName.get("description"),
    ogTitle: byName.get("og:title"),
    ogDescription: byName.get("og:description"),
    ogImage: resolve(byName.get("og:image") ?? byName.get("twitter:image")),
    ogSiteName: byName.get("og:site_name"),
    canonical: resolve(canonical),
    language,
    publishedTime:
      byName.get("article:published_time") ??
      byName.get("date") ??
      byName.get("datepublished"),
    modifiedTime:
      byName.get("article:modified_time") ?? byName.get("last-modified"),
    author: byName.get("author"),
  };
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

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
    const name = record["name"] ?? record["@value"];
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
 * Reads every schema.org JobPosting block on a page.
 *
 * Job *listing* pages (careers indexes, ATS boards) often publish many
 * postings at once, so the array form is what the expansion agent uses.
 */
export function extractJobPostingsJsonLd(html: string): JsonLdJobPosting[] {
  const nodes: Record<string, unknown>[] = [];
  const pattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1] ?? "";
    if (!raw.trim()) continue;
    try {
      flattenJsonLd(JSON.parse(raw), nodes);
    } catch {
      // Some sites emit invalid JSON-LD; ignore that block.
    }
  }

  return nodes
    .filter((node) => {
      const type = node["@type"];
      if (typeof type === "string") return type === "JobPosting";
      return Array.isArray(type) && type.includes("JobPosting");
    })
    .map(parseJobPostingNode);
}

function parseJobPostingNode(posting: Record<string, unknown>): JsonLdJobPosting {
  // The entities are decoded on the way in.
  //
  // A JSON-LD block is not HTML — the browser hands it to the parser
  // as it stands — but the sites that publish them often write the
  // strings as though it were: a posting's title arrives as "Arabic
  // Linguistic Evaluator & Functional Tester", and the catalogue
  // then shows the entity to the user and searches for it in that form.
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
    ? htmlToMarkdown(decodeEntities(descriptionRaw), { onlyMainContent: false })
    : undefined;

  const applyUrl =
    textOf(posting.url) ??
    textOf(posting.applicationContact) ??
    textOf(posting.sameAs);

  const text = (value: string | undefined): string | undefined =>
    value === undefined ? undefined : decodeEntities(value);

  return {
    title: text(textOf(posting.title)),
    description,
    company: text(company),
    location: text(locationRaw),
    city: text(city),
    country: text(country),
    employmentType: text(employmentType),
    datePosted: textOf(posting.datePosted),
    validThrough: textOf(posting.validThrough),
    applyUrl: text(applyUrl),
    salaryMin: Number.isFinite(salaryMin) ? salaryMin : undefined,
    salaryMax: Number.isFinite(salaryMax) ? salaryMax : undefined,
    currency: textOf(salary?.currency),
  };
}

/** Back-compat helper: the first JobPosting on the page. */
export function extractJobPostingJsonLd(html: string): JsonLdJobPosting | null {
  return extractJobPostingsJsonLd(html)[0] ?? null;
}

/**
 * Detects pages that only render their content with JavaScript.
 *
 * The original rule is "fewer than 400 characters of text once the
 * whitespace is collapsed". Collapsing the whitespace of a multi-megabyte
 * document just to answer that question costs more than the question is
 * worth, so the text is counted with a scan that stops as soon as the
 * verdict is known.
 */
export function looksLikeSpa(html: string): boolean {
  if (!/<script/i.test(html)) return false;

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  // Count the collapsed length: each run of whitespace *between* words is one
  // character, every other character is one character, and the leading and
  // trailing whitespace is trimmed — exactly what the original rule counted.
  let length = 0;
  let pendingWhitespace = false;
  let seenContent = false;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const isWhitespace =
      code === 32 || code === 9 || code === 10 || code === 13 || code === 12;

    if (isWhitespace) {
      if (seenContent) pendingWhitespace = true;
      continue;
    }
    if (pendingWhitespace) {
      length += 1;
      pendingWhitespace = false;
      if (length >= 400) return false;
    }
    length += 1;
    seenContent = true;
    if (length >= 400) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// The whole-page pass
// ---------------------------------------------------------------------------

/**
 * Reads everything one page yields.
 *
 * The document is parsed **once**: metadata and JSON-LD come from cheap
 * scanners, the DOM is used only for the cleanup, and Turndown only runs on
 * a document small enough to convert quickly.
 */
export function processHtml(
  html: string,
  options: CleanOptions = {},
  url?: string,
): HtmlProcessingResult {
  const metadata = extractMetadata(html, url);
  const jsonLd = extractJobPostingsJsonLd(html)[0] ?? null;
  const cleaned = cleanHtml(html, options);

  const markdown =
    cleaned.length > MAX_MARKDOWN_HTML_BYTES
      ? postProcessMarkdown(fastTextFromHtml(cleaned))
      : (() => {
          try {
            return postProcessMarkdown(turndown.turndown(cleaned));
          } catch {
            return postProcessMarkdown(fastTextFromHtml(cleaned));
          }
        })();

  return {
    markdown,
    metadata,
    jsonLd,
    looksLikeSpa: looksLikeSpa(html),
  };
}

/**
 * The whole-page pass with no DOM at all.
 *
 * This is the fallback used when the off-thread pass is unavailable or runs
 * out of time. It is linear, so it cannot be the thing that takes the
 * process down — it trades the main-content trimming for that guarantee.
 */
export function processHtmlFast(
  html: string,
  options: CleanOptions = {},
  url?: string,
): HtmlProcessingResult {
  const metadata = extractMetadata(html, url);
  const jsonLd = extractJobPostingsJsonLd(html)[0] ?? null;
  const markdown = postProcessMarkdown(
    fastTextFromHtml(stripHeavyMarkup(html)),
  );
  return {
    markdown,
    metadata,
    jsonLd,
    looksLikeSpa: looksLikeSpa(html),
  };
}
