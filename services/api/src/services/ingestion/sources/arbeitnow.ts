import type { JobSourceAdapter, RawJob } from "../types.js";

interface ArbeitnowJob {
  id?: number | string;
  slug?: string;
  company_name: string;
  company_url?: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  /** Unix timestamp in seconds, not an ISO string. */
  created_at: number | string;
}

function seniorityFromTitle(title: string): RawJob["seniority"] {
  const normalised = title.toLowerCase();
  if (normalised.includes("intern")) return "intern";
  if (normalised.includes("junior") || normalised.includes("entry")) return "junior";
  if (normalised.includes("senior") || normalised.includes("lead")) return "senior";
  if (normalised.includes("principal") || normalised.includes("head of")) return "lead";
  return "mid";
}

/**
 * The board publishes `created_at` as a Unix timestamp in seconds. Passing it
 * straight through made every posting look like it was published in 1970 and
 * the freshness signal was meaningless.
 */
function toIsoDate(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") {
    return new Date().toISOString();
  }
  if (typeof value === "number") {
    const millis = value > 1e11 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && /^\d+$/.test(value)) {
    return toIsoDate(numeric);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function countryFromLocation(location: string): string {
  const normalised = location.toLowerCase();
  if (normalised.includes("germany") || normalised.includes("deutschland")) {
    return "Germany";
  }
  if (normalised.includes("austria") || normalised.includes("österreich")) {
    return "Austria";
  }
  if (normalised.includes("switzerland") || normalised.includes("schweiz")) {
    return "Switzerland";
  }
  if (normalised.includes("remote")) return "Remote";
  return "Germany";
}

export const arbeitnowAdapter: JobSourceAdapter = {
  name: "Arbeitnow",
  type: "public_api",
  url: "https://www.arbeitnow.com/api/job-board-api",
  async fetchJobs(): Promise<RawJob[]> {
    const response = await fetch(
      "https://www.arbeitnow.com/api/job-board-api",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      throw new Error(`ARBEITNOW_HTTP_${response.status}`);
    }

    const payload = (await response.json()) as { data?: ArbeitnowJob[] };
    const jobs = payload.data ?? [];

    return jobs.map((job) => ({
      externalId: String(job.id ?? job.slug ?? job.url),
      title: job.title,
      company: job.company_name,
      companyWebsite: job.company_url,
      description: (job.description ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&/g, "&")
        .replace(/\s+/g, " ")
        .trim(),
      location: job.location,
      country: countryFromLocation(job.location ?? ""),
      workMode: job.remote ? "remote" : "onsite",
      seniority: seniorityFromTitle(job.title),
      employmentType: (job.job_types?.[0] ?? "full_time").toLowerCase(),
      applyUrl: job.url,
      tags: job.tags ?? [],
      postedAt: toIsoDate(job.created_at),
      platform: "arbeitnow",
    }));
  },
};
