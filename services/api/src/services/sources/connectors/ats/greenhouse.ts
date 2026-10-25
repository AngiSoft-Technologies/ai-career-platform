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

interface GreenhouseMetadata {
  name?: string;
  value?: unknown;
}

interface GreenhouseJob {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  updated_at?: string;
  content?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  metadata?: GreenhouseMetadata[];
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

interface ParsedSalary {
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

function metadataValue(
  metadata: GreenhouseMetadata[] | undefined,
  names: string[],
): string | undefined {
  const entry = metadata?.find((item) => {
    const name = item.name?.trim().toLowerCase();
    return name ? names.includes(name) : false;
  });
  if (!entry || entry.value === null || entry.value === undefined) {
    return undefined;
  }
  return typeof entry.value === "string"
    ? entry.value
    : String(entry.value);
}

function parseSalaryRange(value: string | undefined): ParsedSalary {
  if (!value) return {};

  const numbers: number[] = [];
  const normalised = value.replace(/,/g, "");
  const pattern = /\d+(?:\.\d+)?\s*[kKmM]?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalised)) !== null) {
    const raw = match[0].replace(/\s/g, "");
    const multiplier = /[kKmM]$/.test(raw) ? 1000 : 1;
    const number = Number(raw.replace(/[kKmM]$/, ""));
    if (Number.isFinite(number)) numbers.push(number * multiplier);
  }

  if (numbers.length === 0) return {};

  let currency: string | undefined;
  const currencyMatch = value.match(
    /\b(usd|eur|gbp|kes|zar|ngn|inr|cad|aud|jpy|chf)\b/i,
  );
  if (currencyMatch?.[1]) {
    currency = currencyMatch[1].toUpperCase();
  } else if (value.includes("€")) {
    currency = "EUR";
  } else if (value.includes("£")) {
    currency = "GBP";
  } else if (/ksh/i.test(value)) {
    currency = "KES";
  } else if (value.includes("$")) {
    currency = "USD";
  }

  return {
    salaryMin: Math.min(...numbers),
    salaryMax: Math.max(...numbers),
    ...(currency ? { currency } : {}),
  };
}

export class GreenhouseConnector implements Connector {
  name = "Greenhouse";
  kind = "ats" as const;

  detect(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return (
        hostname === "boards.greenhouse.io" ||
        hostname === "job-boards.greenhouse.io"
      );
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
    const endpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(companySegment)}/jobs?content=true`;
    const response = await safeFetch(endpoint, {
      headers: { Accept: "application/json" },
      timeoutMs: 20_000,
      maxBytes: 15_000_000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP_${response.status}`);
    }

    let payload: GreenhouseResponse;
    try {
      payload = JSON.parse(response.body) as GreenhouseResponse;
    } catch {
      throw new Error("INVALID_JSON");
    }

    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    return jobs.map((job) => {
      const title = job.title ?? "Untitled job";
      const description = stripHtml(job.content ?? "") || title;
      const applyUrl =
        job.absolute_url ??
        `https://boards.greenhouse.io/${encodeURIComponent(companySegment)}/jobs/${encodeURIComponent(String(job.id ?? ""))}`;
      const company =
        metadataValue(job.metadata, ["company_name", "company name"]) ??
        "Unknown";
      const salary = parseSalaryRange(
        metadataValue(job.metadata, ["salary range", "salary_range"]),
      );
      const tags = [
        ...(job.departments ?? []).map((department) => department.name),
        ...(job.offices ?? []).map((office) => office.name),
      ].filter((tag): tag is string => Boolean(tag?.trim()));

      return {
        externalId: String(job.id ?? applyUrl),
        title,
        company,
        description,
        location: job.location?.name,
        applyUrl,
        tags,
        postedAt: job.updated_at,
        platform: "greenhouse",
        seniority: guessSeniority(title),
        workMode: guessWorkMode(`${title} ${description}`),
        ...salary,
      };
    });
  }
}
