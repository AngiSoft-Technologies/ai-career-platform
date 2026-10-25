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
  created_at: string;
}

function seniorityFromTitle(title: string): RawJob["seniority"] {
  const normalised = title.toLowerCase();
  if (normalised.includes("intern")) return "intern";
  if (normalised.includes("junior") || normalised.includes("entry")) return "junior";
  if (normalised.includes("senior") || normalised.includes("lead")) return "senior";
  if (normalised.includes("principal") || normalised.includes("head of")) return "lead";
  return "mid";
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
        .replace(/\s+/g, " ")
        .trim(),
      location: job.location,
      country: job.location?.includes("Germany") ? "Germany" : "Remote",
      workMode: job.remote ? "remote" : "onsite",
      seniority: seniorityFromTitle(job.title),
      employmentType: (job.job_types?.[0] ?? "full_time").toLowerCase(),
      applyUrl: job.url,
      tags: job.tags ?? [],
      postedAt: job.created_at,
      platform: "arbeitnow",
    }));
  },
};
