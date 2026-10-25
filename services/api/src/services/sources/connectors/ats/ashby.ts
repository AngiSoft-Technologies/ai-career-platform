import { safeFetch } from "../../http.js";
import {
  guessSeniority,
  guessWorkMode,
  stripHtml,
} from "../html.js";
import type {
  Connector,
  ConnectorConfig,
  ConnectorJob,
  HealthResult,
} from "../types.js";

interface AshbyJob {
  id?: number | string;
  title?: string;
  jobUrl?: string;
  location?: unknown;
  descriptionHtml?: string;
  publishedDate?: string;
  isListed?: boolean;
  compensation?: unknown;
  employmentType?: string;
}

interface ParsedCompensation {
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
}

function firstPathSegment(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0];
    if (!segment) return "";
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function currencyValue(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const match = value.match(/^[A-Za-z]{3}$/);
  if (match?.[0]) return match[0].toUpperCase();
  if (value.includes("€")) return "EUR";
  if (value.includes("£")) return "GBP";
  if (value.includes("$")) return "USD";
  return undefined;
}

function compensationFromRecord(
  record: Record<string, unknown>,
): ParsedCompensation {
  const min = numberValue(record.minValue ?? record.min ?? record.minimum);
  const max = numberValue(record.maxValue ?? record.max ?? record.maximum);
  const currency = currencyValue(
    record.currencyCode ?? record.currency ?? record.currencySymbol,
  );
  const result: ParsedCompensation = {};
  if (min !== undefined) result.salaryMin = min;
  if (max !== undefined) result.salaryMax = max;
  if (currency !== undefined) result.currency = currency;
  return result;
}

function parseCompensation(value: unknown): ParsedCompensation {
  if (!isRecord(value)) return {};

  const summary = value.compensationTierSummary;
  if (Array.isArray(summary)) {
    for (const item of summary) {
      if (!isRecord(item)) continue;
      const parsed = compensationFromRecord(item);
      if (parsed.salaryMin !== undefined || parsed.salaryMax !== undefined) {
        return parsed;
      }
    }
  } else if (isRecord(summary)) {
    const parsed = compensationFromRecord(summary);
    if (parsed.salaryMin !== undefined || parsed.salaryMax !== undefined) {
      return parsed;
    }
  }

  return compensationFromRecord(value);
}

function locationText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  const location = value.location ?? value.name ?? value.city;
  return typeof location === "string" ? location : undefined;
}

function configuredCompany(config: ConnectorConfig): string | undefined {
  const value = config.options?.companyName;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export class AshbyConnector implements Connector {
  name = "Ashby";
  kind = "ats" as const;

  detect(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname.endsWith("ashbyhq.com");
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
    const companySegment = firstPathSegment(config.url);
    const endpoint = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(companySegment)}?includeCompensation=true`;
    const response = await safeFetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ includeCompensation: true }),
      timeoutMs: 20_000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP_${response.status}`);
    }

    let payload: { jobs?: AshbyJob[] };
    try {
      payload = JSON.parse(response.body) as { jobs?: AshbyJob[] };
    } catch {
      throw new Error("INVALID_JSON");
    }

    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    return jobs
      .filter((job) => job.isListed !== false)
      .map((job) => {
        const title = job.title ?? "Untitled job";
        const description = stripHtml(job.descriptionHtml ?? "") || title;
        const applyUrl =
          job.jobUrl ??
          `https://jobs.ashbyhq.com/${encodeURIComponent(companySegment)}/${encodeURIComponent(String(job.id ?? ""))}`;
        const company =
          configuredCompany(config) || companySegment || "Unknown";
        const compensation = parseCompensation(job.compensation);

        return {
          externalId: String(job.id ?? applyUrl),
          title,
          company,
          description,
          location: locationText(job.location),
          employmentType: job.employmentType,
          applyUrl,
          tags: [],
          postedAt: job.publishedDate,
          platform: "ashby",
          seniority: guessSeniority(title),
          workMode: guessWorkMode(`${title} ${description}`),
          ...compensation,
        };
      });
  }
}
