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

interface LeverList {
  text?: string;
  content?: string;
}

interface LeverJob {
  id?: number | string;
  text?: string;
  hostedUrl?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
  };
  descriptionPlain?: string;
  lists?: LeverList[];
  createdAt?: number | string;
  additionalPlain?: string;
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

function listDescription(lists: LeverList[] | undefined): string {
  return (lists ?? [])
    .map((list) => {
      const text = list.text?.trim();
      const content = stripHtml(list.content ?? "").trim();
      if (text && content) return `${text}: ${content}`;
      return text || content;
    })
    .filter(Boolean)
    .join("\n\n");
}

export class LeverConnector implements Connector {
  name = "Lever";
  kind = "ats" as const;

  detect(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase() === "jobs.lever.co";
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
    const endpoint = `https://api.lever.co/v0/postings/${encodeURIComponent(companySegment)}?mode=json`;
    const response = await safeFetch(endpoint, {
      headers: { Accept: "application/json" },
      timeoutMs: 60_000,
      maxBytes: 15_000_000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP_${response.status}`);
    }

    let payload: LeverJob[];
    try {
      const parsed = JSON.parse(response.body) as unknown;
      payload = Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new Error("INVALID_JSON");
    }

    return payload.map((job) => {
      const title = job.text ?? "Untitled job";
      const description =
        [
          stripHtml(job.descriptionPlain ?? "").trim(),
          listDescription(job.lists),
          stripHtml(job.additionalPlain ?? "").trim(),
        ]
          .filter(Boolean)
          .join("\n\n") || title;
      const applyUrl =
        job.hostedUrl ??
        `https://jobs.lever.co/${encodeURIComponent(companySegment)}`;
      const company = job.categories?.team?.trim() || "Unknown";
      const tags = [
        job.categories?.team,
        job.categories?.commitment,
      ].filter((tag): tag is string => Boolean(tag?.trim()));

      return {
        externalId: String(job.id ?? applyUrl),
        title,
        company,
        description,
        location: job.categories?.location,
        employmentType: job.categories?.commitment,
        applyUrl,
        tags,
        postedAt:
          typeof job.createdAt === "number"
            ? new Date(job.createdAt).toISOString()
            : job.createdAt,
        platform: "lever",
        seniority: guessSeniority(title),
        workMode: guessWorkMode(`${title} ${description}`),
      };
    });
  }
}
