import type { JobSourceAdapter, RawJob } from "../types.js";

interface RemotiveJob {
  id: number | string;
  url: string;
  title: string;
  company_name: string;
  company_url?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

function parseSalary(value: string | undefined): {
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
} {
  if (!value) return {};
  const numbers = [...value.matchAll(/\d[\d,.]*/g)]
    .map((match) => Number(match[0].replace(/[,.]/g, "")))
    .filter((number) => Number.isFinite(number) && number > 1000);
  const currency = value.includes("€") ? "EUR" : value.includes("$") ? "USD" : "GBP";
  if (numbers.length === 0) return { currency };
  return {
    salaryMin: Math.min(...numbers),
    salaryMax: Math.max(...numbers),
    currency,
  };
}

export const remotiveAdapter: JobSourceAdapter = {
  name: "Remotive",
  type: "public_api",
  url: "https://remotive.com/api/remote-jobs",
  async fetchJobs(): Promise<RawJob[]> {
    const response = await fetch("https://remotive.com/api/remote-jobs", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`REMOTIVE_HTTP_${response.status}`);
    }

    const payload = (await response.json()) as { jobs?: RemotiveJob[] };
    const jobs = payload.jobs ?? [];

    return jobs.map((job) => ({
      externalId: String(job.id),
      title: job.title,
      company: job.company_name,
      companyWebsite: job.company_url,
      description: (job.description ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      country: "Remote",
      workMode: "remote",
      employmentType: (job.job_type ?? "full_time").toLowerCase(),
      applyUrl: job.url,
      tags: [...(job.tags ?? []), ...(job.category ? [job.category] : [])],
      postedAt: job.publication_date,
      platform: "remotive",
      ...parseSalary(job.salary),
    }));
  },
};
