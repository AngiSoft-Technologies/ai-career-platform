import { safeFetch } from "../http.js";
import {
  extractLinks,
  guessSeniority,
  guessWorkMode,
  stripHtml,
} from "./html.js";
import type {
  Connector,
  ConnectorConfig,
  ConnectorJob,
  HealthResult,
} from "./types.js";

interface ParsedEntry {
  title: string;
  link?: string;
  description: string;
  postedAt?: string;
  externalId?: string;
}

function decodeXml(value: string): string {
  const entity = String.fromCharCode(38);
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replaceAll(`${entity}lt;`, "<")
    .replaceAll(`${entity}gt;`, ">")
    .replaceAll(`${entity}quot;`, '"')
    .replaceAll(`${entity}apos;`, "'")
    .replaceAll(`${entity}amp;`, "&");
}

function tagValue(block: string, names: string[]): string | undefined {
  for (const name of names) {
    const pattern = new RegExp(
      `<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,
      "i",
    );
    const match = block.match(pattern);
    const value = match?.[1] ? decodeXml(match[1]).trim() : "";
    if (value) return value;
  }
  return undefined;
}

function resolveUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  const cleaned = decodeXml(value).trim();
  if (!cleaned) return undefined;
  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function entryLink(block: string, baseUrl: string, content: string): string | undefined {
  const atomLink = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i)?.[1];
  const rssLink = tagValue(block, ["link"]);
  const enclosure = block.match(
    /<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*\/?>/i,
  )?.[1];

  const direct =
    resolveUrl(atomLink, baseUrl) ??
    resolveUrl(rssLink, baseUrl) ??
    resolveUrl(enclosure, baseUrl);
  if (direct) return direct;

  const contentLink = extractLinks(content, baseUrl)[0]?.url;
  return contentLink;
}

function parseEntry(block: string, baseUrl: string): ParsedEntry {
  const title = stripHtml(decodeXml(tagValue(block, ["title"]) ?? "")).trim();
  const content = tagValue(block, [
    "content:encoded",
    "content",
    "description",
    "summary",
  ]) ?? "";
  const description = stripHtml(decodeXml(content)).trim();
  const link = entryLink(block, baseUrl, content);
  const postedAt = tagValue(block, ["pubDate", "published", "updated", "dc:date"]);
  const externalId = tagValue(block, ["guid", "id"]);

  return {
    title: title || "Untitled job",
    link,
    description,
    postedAt,
    externalId,
  };
}

function optionString(
  options: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = options?.[key];
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

export class RssConnector implements Connector {
  name = "RSS";
  kind = "rss" as const;

  detect(url: string, options?: Record<string, unknown>): boolean {
    if (options?.feed === true) return true;

    const raw = url.trim().toLowerCase().split("#")[0]?.split("?")[0] ?? "";
    if (raw.endsWith(".xml") || raw.endsWith(".rss")) return true;

    try {
      const pathname = new URL(url).pathname.toLowerCase();
      return pathname.endsWith(".xml") || pathname.endsWith(".rss");
    } catch {
      return false;
    }
  }

  async healthCheck(config: ConnectorConfig): Promise<HealthResult> {
    try {
      const response = await safeFetch(config.url, { timeoutMs: 12_000 });
      return {
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        contentType: response.contentType,
        error: response.status >= 400 ? `HTTP_${response.status}` : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "FETCH_FAILED",
      };
    }
  }

  async fetchJobs(config: ConnectorConfig): Promise<ConnectorJob[]> {
    const options: Record<string, unknown> = config.options ?? {};
    const response = await safeFetch(config.url, { timeoutMs: 20_000 });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP_${response.status}`);
    }

    const itemBlocks = [
      ...response.body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ].map((match) => match[1] ?? "");
    const entryBlocks =
      itemBlocks.length > 0
        ? itemBlocks
        : [
            ...response.body.matchAll(
              /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi,
            ),
          ].map((match) => match[1] ?? "");

    const company = optionString(options, "companyName") ?? "Unknown";
    const location = optionString(options, "location");
    const country = optionString(options, "country");
    const jobs: ConnectorJob[] = [];

    for (const block of entryBlocks) {
      const entry = parseEntry(block, response.finalUrl || config.url);
      if (!entry.link) continue;

      const description = entry.description || entry.title;
      jobs.push({
        externalId: entry.externalId ?? entry.link,
        title: entry.title,
        company,
        description,
        location,
        country,
        applyUrl: entry.link,
        tags: [],
        postedAt: entry.postedAt,
        platform: "rss",
        sourceUrl: config.url,
        seniority: guessSeniority(entry.title),
        workMode: guessWorkMode(`${entry.title} ${description}`),
      });
    }

    return jobs;
  }
}
