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

interface WorkableJob {
  id?: number | string;
  title?: string;
  url?: string;
  description?: string;
  location?: string;
  employment_type?: string;
  departments?: unknown[];
  created_at?: string;
  requirements?: unknown;
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

function requirementText(value: unknown): string {
  if (typeof value === "string") return stripHtml(value).trim();
  if (Array.isArray(value)) {
    return value.map(requirementText).filter(Boolean).join("\n");
  }
  if (!isRecord(value)) return "";

  const direct = value.description ?? value.text ?? value.content ?? value.value;
  if (direct !== undefined) return requirementText(direct);

  return Object.values(value)
    .map(requirementText)
    .filter(Boolean)
    .join("\n");
}

function departmentName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  const name = value.name ?? value.label ?? value.title;
  return typeof name === "string" ? name : undefined;
}

function configuredCompany(config: ConnectorConfig): string | undefined {
  const value = config.options?.companyName;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export class WorkableConnector implements Connector {
  name = "Workable";
  kind = "ats" as const;

  detect(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase() === "apply.workable.com";
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
    const endpoint = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(companySegment)}/jobs`;
    const response = await safeFetch(endpoint, {
      headers: { Accept: "application/json" },
      timeoutMs: 20_000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP_${response.status}`);
    }

    let payload: { jobs?: WorkableJob[] };
    try {
      payload = JSON.parse(response.body) as { jobs?: WorkableJob[] };
    } catch {
      throw new Error("INVALID_JSON");
    }

    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    return jobs.map((job) => {
      const title = job.title ?? "Untitled job";
      const requirements = requirementText(job.requirements);
      const description =
        [stripHtml(job.description ?? "").trim(), requirements]
          .filter(Boolean)
          .join("\n\n") || title;
      const applyUrl =
        job.url ??
        `https://apply.workable.com/${encodeURIComponent(companySegment)}/j/${encodeURIComponent(String(job.id ?? ""))}`;
      const company = configuredCompany(config) || companySegment || "Unknown";
      const tags = (job.departments ?? [])
        .map(departmentName)
        .filter((tag): tag is string => Boolean(tag?.trim()));

      return {
        externalId: String(job.id ?? applyUrl),
        title,
        company,
        description,
        location: job.location,
        employmentType: job.employment_type,
        applyUrl,
        tags,
        postedAt: job.created_at,
        platform: "workable",
        seniority: guessSeniority(title),
        workMode: guessWorkMode(`${title} ${description}`),
      };
    });
  }
}
