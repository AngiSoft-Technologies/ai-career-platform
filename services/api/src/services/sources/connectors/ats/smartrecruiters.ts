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

interface SmartRecruitersJob {
  id?: number | string;
  name?: string;
  location?: {
    city?: string;
    country?: unknown;
    region?: string;
  };
  departments?: Array<{ label?: string }>;
  ref?: string;
  releasedDate?: string;
  jobAd?: {
    sections?: unknown;
  };
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

function locationPart(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!isRecord(value)) return undefined;
  const part = value.name ?? value.city ?? value.countryCode ?? value.code;
  return typeof part === "string" ? part.trim() || undefined : undefined;
}

function sectionText(value: unknown): string {
  if (typeof value === "string") return stripHtml(value).trim();
  if (Array.isArray(value)) {
    return value.map(sectionText).filter(Boolean).join("\n\n");
  }
  if (!isRecord(value)) return "";

  const title = value.title ?? value.name;
  const description = value.description ?? value.text ?? value.content;
  const parts = [
    typeof title === "string" ? title.trim() : "",
    typeof description === "string" ? stripHtml(description).trim() : "",
  ].filter(Boolean);

  if (parts.length > 0) return parts.join("\n");
  return Object.values(value)
    .map(sectionText)
    .filter(Boolean)
    .join("\n");
}

function configuredCompany(config: ConnectorConfig): string | undefined {
  const value = config.options?.companyName;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export class SmartRecruitersConnector implements Connector {
  name = "SmartRecruiters";
  kind = "ats" as const;

  detect(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase() === "jobs.smartrecruiters.com";
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
    const endpoint = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companySegment)}/postings?limit=100`;
    const response = await safeFetch(endpoint, {
      headers: { Accept: "application/json" },
      timeoutMs: 20_000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP_${response.status}`);
    }

    let payload: { content?: SmartRecruitersJob[] };
    try {
      payload = JSON.parse(response.body) as { content?: SmartRecruitersJob[] };
    } catch {
      throw new Error("INVALID_JSON");
    }

    const jobs = Array.isArray(payload.content) ? payload.content : [];
    return jobs.map((job) => {
      const title = job.name ?? "Untitled job";
      const description = sectionText(job.jobAd?.sections) || title;
      const applyUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(companySegment)}/jobs/${encodeURIComponent(String(job.id ?? job.ref ?? ""))}`;
      const company = configuredCompany(config) || companySegment || "Unknown";
      const location = [job.location?.city, job.location?.region]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(", ");
      const country = locationPart(job.location?.country);
      const tags = (job.departments ?? [])
        .map((department) => department.label)
        .filter((tag): tag is string => Boolean(tag?.trim()));

      return {
        externalId: String(job.id ?? job.ref ?? applyUrl),
        title,
        company,
        description,
        location: location || undefined,
        country,
        applyUrl,
        tags,
        postedAt: job.releasedDate,
        platform: "smartrecruiters",
        seniority: guessSeniority(title),
        workMode: guessWorkMode(`${title} ${description}`),
      };
    });
  }
}
