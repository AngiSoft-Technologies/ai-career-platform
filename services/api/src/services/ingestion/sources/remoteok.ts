import type { JobSourceAdapter, RawJob } from "../types.js";

interface RemoteOkJob {
  id: string;
  slug?: string;
  company?: string;
  company_logo?: string;
  position: string;
  description: string;
  location: string;
  tags: string[];
  job_type?: string;
  date_published?: string;
  url: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
}

export const remoteokAdapter: JobSourceAdapter = {
  name: "RemoteOK",
  type: "public_api",
  url: "https://remoteok.com/api",
  async fetchJobs(): Promise<RawJob[]> {
    const response = await fetch("https://remoteok.com/api", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`REMOTEOK_HTTP_${response.status}`);
    }

    const payload = (await response.json()) as RemoteOkJob[];
    const jobs = Array.isArray(payload) ? payload : [];

    return jobs
      .filter((job) => Boolean(job?.position && job?.company))
      .map((job) => ({
        externalId: job.id,
        title: job.position,
        company: job.company as string,
        description: (job.description ?? "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        location: job.location,
        country: "Remote",
        workMode: "remote",
        employmentType: (job.job_type ?? "full_time").toLowerCase(),
        salaryMin: job.salary_min,
        salaryMax: job.salary_max,
        currency: job.salary_currency,
        applyUrl: job.url,
        tags: job.tags ?? [],
        postedAt: job.date_published,
        platform: "remoteok",
      }));
  },
};
