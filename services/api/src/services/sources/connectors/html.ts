import { safeFetch } from "../http.js";
import type {
  Connector,
  ConnectorConfig,
  ConnectorJob,
  HealthResult,
} from "./types.js";

const JOB_LINK_HINTS = [
  "/job/",
  "/jobs/",
  "/vacanc",
  "/career",
  "/position",
  "/opening",
  "/opportunit",
  "/internship",
  "/graduate",
  "/work-with-us",
  "/employment",
  "/requisition",
  "/apply/",
];

const TITLE_TAGS = ["h1", "h2", "h3"];
const SKIP_TEXT = [
  "job alert",
  "all jobs",
  "browse jobs",
  "search jobs",
  "sign in",
  "log in",
  "register",
  "post a job",
  "create account",
  "newsletter",
  "privacy policy",
  "terms of service",
  "cookie",
];

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLinks(
  html: string,
  baseUrl: string,
): Array<{ url: string; text: string }> {
  const links: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1];
    const text = stripHtml(match[2] ?? "").trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      continue;
    }

    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    if (seen.has(absolute)) continue;
    seen.add(absolute);

    links.push({ url: absolute, text });
  }

  return links;
}

export function looksLikeJobLink(
  link: { url: string; text: string },
  hints: string[] = JOB_LINK_HINTS,
): boolean {
  const haystack = `${link.url} ${link.text}`.toLowerCase();
  if (SKIP_TEXT.some((skip) => haystack.includes(skip))) return false;
  return hints.some((hint) => haystack.includes(hint));
}

function guessCompany(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const label = hostname.split(".")[0] ?? hostname;
    return label
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Unknown";
  }
}

export function guessSeniority(title: string): ConnectorJob["seniority"] {
  const normalised = title.toLowerCase();
  if (/\b(intern|internship|graduate|trainee|apprentice)\b/.test(normalised)) {
    return "intern";
  }
  if (/\b(junior|jr\.?|entry[- ]level|graduate|associate)\b/.test(normalised)) {
    return "junior";
  }
  if (/\b(senior|sr\.?|specialist|experienced)\b/.test(normalised)) {
    return "senior";
  }
  if (/\b(lead|principal|staff|head of|director|chief)\b/.test(normalised)) {
    return "lead";
  }
  return "mid";
}

export function guessWorkMode(text: string): ConnectorJob["workMode"] {
  const normalised = text.toLowerCase();
  if (normalised.includes("hybrid")) return "hybrid";
  if (normalised.includes("remote")) return "remote";
  return "onsite";
}

export function extractEmail(text: string): string | undefined {
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0];
}

function extractTitle(html: string, fallback: string): string {
  for (const tag of TITLE_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]{0,200}?)</${tag}>`, "i");
    const match = html.match(pattern);
    const value = match ? stripHtml(match[1] ?? "") : "";
    if (value.length >= 4 && value.length <= 180) return value;
  }
  return fallback;
}

export interface HtmlAdapterOptions {
  linkHints?: string[];
  companyName?: string;
  maxJobs?: number;
  detailSelectors?: { title?: string; description?: string };
}

export class HtmlConnector implements Connector {
  name = "generic_web";
  kind = "html" as const;

  detect(): boolean {
    return true;
  }

  async healthCheck(config: ConnectorConfig): Promise<HealthResult> {
    try {
      const response = await safeFetch(config.url, { timeoutMs: 12_000 });
      return {
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        contentType: response.contentType,
        error:
          response.status >= 400 ? `HTTP_${response.status}` : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "FETCH_FAILED",
      };
    }
  }

  async fetchJobs(config: ConnectorConfig): Promise<ConnectorJob[]> {
    const options = (config.options ?? {}) as HtmlAdapterOptions;
    const response = await safeFetch(config.url, { timeoutMs: 20_000 });
    const links = extractLinks(response.body, response.finalUrl);
    const candidates = links
      .filter((link) => looksLikeJobLink(link, options.linkHints))
      .filter((link) => link.text.length >= 3)
      .slice(0, options.maxJobs ?? 100);

    const company =
      options.companyName ?? guessCompany(response.finalUrl);
    const jobs: ConnectorJob[] = [];

    for (const link of candidates) {
      const title = link.text;
      if (SKIP_TEXT.some((skip) => title.toLowerCase().includes(skip))) continue;

      let description = "";
      let postedAt: string | undefined;

      try {
        const detail = await safeFetch(link.url, {
          timeoutMs: 12_000,
          maxBytes: 800_000,
        });
        if (detail.status >= 200 && detail.status < 400) {
          description = stripHtml(detail.body).slice(0, 6000);
          const titleMatch = detail.body.match(
            /<title[^>]*>([\s\S]{0,300}?)<\/title>/i,
          );
          if (titleMatch) {
            const pageTitle = stripHtml(titleMatch[1] ?? "")
              .split(/[|\-–—·]/)[0]
              ?.trim();
            if (pageTitle && pageTitle.length >= 4 && pageTitle.length <= 180) {
              const extracted = extractTitle(detail.body, pageTitle);
              if (extracted.length > title.length) {
                // keep original link text when the page title is less specific
              }
            }
          }
          const dateMatch = detail.body.match(
            /"datePosted"\s*:\s*"([^"]+)"|datetime="([^"]+)"/i,
          );
          postedAt = dateMatch?.[1] ?? dateMatch?.[2];
        }
      } catch {
        description = title;
      }

      jobs.push({
        externalId: link.url,
        title,
        company,
        description: description || title,
        applyUrl: link.url,
        tags: [],
        platform: "web",
        sourceUrl: link.url,
        seniority: guessSeniority(title),
        workMode: guessWorkMode(`${title} ${description}`),
        postedAt,
      });
    }

    return jobs;
  }
}
