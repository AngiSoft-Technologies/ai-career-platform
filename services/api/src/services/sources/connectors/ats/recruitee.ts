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

interface RecruiteeOffer {
  id?: number | string;
  title?: string;
  careers_url?: string;
  careers_apply_url?: string;
  description?: string;
  location?: string;
  employment_type?: string;
  created_at?: string;
  requirements?: string;
}

function companyFromHostname(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const suffix = ".recruitee.com";
    if (!hostname.endsWith(suffix)) return "";
    return hostname.slice(0, -suffix.length);
  } catch {
    return "";
  }
}

function configuredCompany(config: ConnectorConfig): string | undefined {
  const value = config.options?.companyName;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export class RecruiteeConnector implements Connector {
  name = "Recruitee";
  kind = "ats" as const;

  detect(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname.endsWith(".recruitee.com");
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
    const companySegment = companyFromHostname(config.url);
    const endpoint = `https://${companySegment}.recruitee.com/api/offers/`;
    const response = await safeFetch(endpoint, {
      headers: { Accept: "application/json" },
      timeoutMs: 20_000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP_${response.status}`);
    }

    let payload: { offers?: RecruiteeOffer[] };
    try {
      payload = JSON.parse(response.body) as { offers?: RecruiteeOffer[] };
    } catch {
      throw new Error("INVALID_JSON");
    }

    const jobs = Array.isArray(payload.offers) ? payload.offers : [];
    return jobs.map((job) => {
      const title = job.title ?? "Untitled job";
      const description =
        [
          stripHtml(job.description ?? "").trim(),
          stripHtml(job.requirements ?? "").trim(),
        ]
          .filter(Boolean)
          .join("\n\n") || title;
      const applyUrl =
        job.careers_apply_url ??
        job.careers_url ??
        `https://${companySegment}.recruitee.com/`;
      const company = configuredCompany(config) || companySegment || "Unknown";

      return {
        externalId: String(job.id ?? applyUrl),
        title,
        company,
        description,
        location: job.location,
        employmentType: job.employment_type,
        applyUrl,
        tags: [],
        postedAt: job.created_at,
        platform: "recruitee",
        seniority: guessSeniority(title),
        workMode: guessWorkMode(`${title} ${description}`),
      };
    });
  }
}
