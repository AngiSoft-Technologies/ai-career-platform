/**
 * Free, key-less job sources.
 *
 * the ACE search path is great for discovery but search engines rate-limit
 * datacenter IPs. These public job APIs and RSS feeds give us a guaranteed
 * fresh stream every cycle without any API key or paid plan:
 *
 *   RemoteOK, Remotive, Arbeitnow, Jobicy, Himalayas, ReliefWeb (NGO/UN).
 *
 * Each adapter normalises to the same shape so the rest of the pipeline
 * (dedupe → promote → match) does not care where a job came from.
 */

import { logger } from "../../logger.js";
import { fetchJson } from "./fetch.js";
import { htmlToMarkdown } from "./html.js";

export interface RawJob {
  sourcePlatform: string;
  externalId: string;
  url: string;
  applyUrl: string;
  title: string;
  company: string | null;
  description: string;
  location: string | null;
  country: string | null;
  city: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  postedAt: Date | null;
  skills: string[];
  raw?: Record<string, unknown>;
}

export interface SourceRunResult {
  source: string;
  jobs: RawJob[];
  error?: string;
}

const UA_HEADERS = { Accept: "application/json,text/xml,*/*" };

function toText(html: string | null | undefined, limit = 12_000): string {
  if (!html) return "";
  return htmlToMarkdown(html, { onlyMainContent: false }).slice(0, limit);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectWorkMode(text: string): "remote" | "hybrid" | "onsite" | null {
  const lower = text.toLowerCase();
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("remote") || lower.includes("anywhere")) return "remote";
  if (lower.includes("on-site") || lower.includes("onsite")) return "onsite";
  return null;
}

const SKILLS = [
  "javascript", "typescript", "python", "java", "golang", "go", "rust", "c++", "c#",
  "php", "ruby", "swift", "kotlin", "dart", "scala", "react", "vue", "angular",
  "svelte", "next.js", "node.js", "express", "django", "flask", "spring",
  "laravel", "rails", "aws", "azure", "gcp", "docker", "kubernetes", "terraform",
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "machine learning",
  "data science", "devops", "ci/cd", "figma", "ux", "ui", "product management",
  "project management", "marketing", "sales",
];

function detectSkills(text: string): string[] {
  const lower = text.toLowerCase();
  return SKILLS.filter((skill) => lower.includes(skill)).slice(0, 20);
}

function normaliseEmployment(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase().replace(/\s+/g, "_");
  if (lower.includes("full")) return "full_time";
  if (lower.includes("part")) return "part_time";
  if (lower.includes("contract")) return "contract";
  if (lower.includes("intern")) return "internship";
  if (lower.includes("freelance")) return "freelance";
  return lower;
}

// ---------------------------------------------------------------------------
// RemoteOK
// ---------------------------------------------------------------------------

interface RemoteOkJob {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  description?: string;
  location?: string;
  tags?: string[];
  url?: string;
  apply_url?: string;
  date?: string;
  salary_min?: number;
  salary_max?: number;
}

async function remoteOk(): Promise<RawJob[]> {
  const payload = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api", {
    headers: UA_HEADERS,
  });
  return (Array.isArray(payload) ? payload : [])
    .filter((job) => job.position && job.company && job.url)
    .map((job) => {
      const description = toText(job.description);
      const location = job.location ?? "Remote";
      return {
        sourcePlatform: "remoteok",
        externalId: String(job.id ?? job.slug ?? job.url),
        url: job.url!,
        applyUrl: job.apply_url ?? job.url!,
        title: job.position!.trim(),
        company: job.company!.trim(),
        description,
        location,
        country: /worldwide|anywhere/i.test(location) ? "Remote" : null,
        city: null,
        workMode: "remote" as const,
        employmentType: "full_time",
        salaryMin: asNumber(job.salary_min),
        salaryMax: asNumber(job.salary_max),
        currency: "USD",
        postedAt: asDate(job.date),
        skills: job.tags?.slice(0, 20) ?? detectSkills(description),
      };
    });
}

// ---------------------------------------------------------------------------
// Remotive
// ---------------------------------------------------------------------------

interface RemotiveJob {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  description?: string;
  job_type?: string;
  candidate_required_location?: string;
  salary?: string;
  publication_date?: string;
  tags?: string[];
}

async function remotive(): Promise<RawJob[]> {
  const payload = await fetchJson<{ jobs?: RemotiveJob[] }>(
    "https://remotive.com/api/remote-jobs?limit=100",
    { headers: UA_HEADERS },
  );
  return (payload.jobs ?? [])
    .filter((job) => job.title && job.company_name && job.url)
    .map((job) => {
      const description = toText(job.description);
      const location = job.candidate_required_location ?? "Remote";
      return {
        sourcePlatform: "remotive",
        externalId: String(job.id ?? job.url),
        url: job.url!,
        applyUrl: job.url!,
        title: job.title!.trim(),
        company: job.company_name!.trim(),
        description,
        location,
        country: /worldwide|anywhere/i.test(location) ? "Remote" : null,
        city: null,
        workMode: "remote" as const,
        employmentType: normaliseEmployment(job.job_type),
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: asDate(job.publication_date),
        skills: job.tags?.slice(0, 20) ?? detectSkills(description),
      };
    });
}

// ---------------------------------------------------------------------------
// Arbeitnow
// ---------------------------------------------------------------------------

interface ArbeitnowJob {
  slug?: string;
  url?: string;
  title?: string;
  company_name?: string;
  description?: string;
  remote?: boolean;
  location?: string;
  tags?: string[];
  job_types?: string[];
  created_at?: number;
}

async function arbeitnow(): Promise<RawJob[]> {
  const payload = await fetchJson<{ data?: ArbeitnowJob[] }>(
    "https://www.arbeitnow.com/api/job-board-api",
    { headers: UA_HEADERS },
  );
  return (payload.data ?? [])
    .filter((job) => job.title && job.company_name && job.url)
    .map((job) => {
      const description = toText(job.description);
      return {
        sourcePlatform: "arbeitnow",
        externalId: job.slug ?? job.url!,
        url: job.url!,
        applyUrl: job.url!,
        title: job.title!.trim(),
        company: job.company_name!.trim(),
        description,
        location: job.location ?? null,
        country: null,
        city: job.location ?? null,
        workMode: job.remote ? "remote" : detectWorkMode(description),
        employmentType: normaliseEmployment(job.job_types?.[0]),
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: job.created_at ? new Date(job.created_at * 1000) : null,
        skills: job.tags?.slice(0, 20) ?? detectSkills(description),
      };
    });
}

// ---------------------------------------------------------------------------
// Jobicy
// ---------------------------------------------------------------------------

interface JobicyJob {
  id?: number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  jobGeo?: string;
  jobType?: string[];
  pubDate?: string;
  annualSalaryMin?: number;
  annualSalaryMax?: number;
  salaryCurrency?: string;
  jobLevel?: string;
}

async function jobicy(): Promise<RawJob[]> {
  const payload = await fetchJson<{ jobs?: JobicyJob[] }>(
    "https://jobicy.com/api/v2/remote-jobs?count=50",
    { headers: UA_HEADERS },
  );
  return (payload.jobs ?? [])
    .filter((job) => job.jobTitle && job.companyName && job.url)
    .map((job) => {
      const description = toText(job.jobDescription);
      return {
        sourcePlatform: "jobicy",
        externalId: String(job.id ?? job.url),
        url: job.url!,
        applyUrl: job.url!,
        title: job.jobTitle!.trim(),
        company: job.companyName!.trim(),
        description,
        location: job.jobGeo ?? "Remote",
        country: /africa/i.test(job.jobGeo ?? "") ? null : null,
        city: null,
        workMode: "remote" as const,
        employmentType: normaliseEmployment(job.jobType?.[0]),
        salaryMin: asNumber(job.annualSalaryMin),
        salaryMax: asNumber(job.annualSalaryMax),
        currency: job.salaryCurrency ?? null,
        postedAt: asDate(job.pubDate),
        skills: detectSkills(description),
      };
    });
}

// ---------------------------------------------------------------------------
// Himalayas
// ---------------------------------------------------------------------------

interface HimalayasJob {
  title?: string;
  companyName?: string;
  applicationLink?: string;
  description?: string;
  locationRestrictions?: string[];
  pubDate?: number;
  minSalary?: number;
  maxSalary?: number;
  currency?: string;
  seniority?: string[];
}

async function himalayas(): Promise<RawJob[]> {
  const payload = await fetchJson<{ jobs?: HimalayasJob[] }>(
    "https://himalayas.app/jobs/api?limit=50",
    { headers: UA_HEADERS },
  );
  return (payload.jobs ?? [])
    .filter((job) => job.title && job.companyName && job.applicationLink)
    .map((job) => {
      const description = toText(job.description);
      const location = job.locationRestrictions?.join(", ") ?? "Remote";
      return {
        sourcePlatform: "himalayas",
        externalId: job.applicationLink!,
        url: job.applicationLink!,
        applyUrl: job.applicationLink!,
        title: job.title!.trim(),
        company: job.companyName!.trim(),
        description,
        location,
        country: null,
        city: null,
        workMode: "remote" as const,
        employmentType: "full_time",
        salaryMin: asNumber(job.minSalary),
        salaryMax: asNumber(job.maxSalary),
        currency: job.currency ?? null,
        postedAt: job.pubDate ? new Date(job.pubDate * 1000) : null,
        skills: detectSkills(description),
      };
    });
}

// ---------------------------------------------------------------------------
// ReliefWeb (UN / NGO)
// ---------------------------------------------------------------------------

interface ReliefWebJob {
  id?: string;
  fields?: {
    title?: string;
    url?: string;
    body?: string;
    date?: { created?: string };
    source?: Array<{ name?: string }>;
    country?: Array<{ name?: string }>;
    city?: Array<{ name?: string }>;
    career_categories?: Array<{ name?: string }>;
    experience?: Array<{ name?: string }>;
  };
}

async function reliefWeb(): Promise<RawJob[]> {
  const fields = [
    "title",
    "url",
    "body",
    "date.created",
    "source.name",
    "country.name",
    "city.name",
    "career_categories.name",
    "experience.name",
  ]
    .map((field) => `fields[include][]=${encodeURIComponent(field)}`)
    .join("&");

  const payload = await fetchJson<{ data?: ReliefWebJob[] }>(
    `https://api.reliefweb.int/v1/jobs?appname=mboqara&limit=50&sort[]=date.created:desc&${fields}`,
    { headers: UA_HEADERS },
  );

  return (payload.data ?? [])
    .filter((job) => job.fields?.title && job.fields?.url)
    .map((job) => {
      const description = toText(job.fields?.body);
      const country = job.fields?.country?.[0]?.name ?? null;
      return {
        sourcePlatform: "reliefweb",
        externalId: String(job.id ?? job.fields?.url),
        url: job.fields!.url!,
        applyUrl: job.fields!.url!,
        title: job.fields!.title!.trim(),
        company: job.fields?.source?.[0]?.name ?? "UN / NGO",
        description,
        location: [country, job.fields?.city?.[0]?.name].filter(Boolean).join(", ") || null,
        country,
        city: job.fields?.city?.[0]?.name ?? null,
        workMode: detectWorkMode(description) ?? "onsite",
        employmentType: "full_time",
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: asDate(job.fields?.date?.created),
        skills: detectSkills(description),
      };
    });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const ADAPTERS: Array<{ name: string; run: () => Promise<RawJob[]> }> = [
  { name: "remoteok", run: remoteOk },
  { name: "remotive", run: remotive },
  { name: "arbeitnow", run: arbeitnow },
  { name: "jobicy", run: jobicy },
  { name: "himalayas", run: himalayas },
  // ReliefWeb v1 was decommissioned and v2 requires an approved appname.
  // We deliberately do not depend on it; the four sources above are key-less.
];

export async function fetchFreeJobs(): Promise<{
  jobs: RawJob[];
  results: SourceRunResult[];
}> {
  const settled = await Promise.allSettled(
    ADAPTERS.map(async (adapter) => ({
      source: adapter.name,
      jobs: await adapter.run(),
    })),
  );

  const results: SourceRunResult[] = [];
  const seen = new Set<string>();
  const jobs: RawJob[] = [];

  settled.forEach((result, index) => {
    const name = ADAPTERS[index]!.name;
    if (result.status === "rejected") {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      logger.warn({ source: name, error: message }, "Free job source failed");
      results.push({ source: name, jobs: [], error: message });
      return;
    }
    results.push(result.value);
    for (const job of result.value.jobs) {
      if (seen.has(job.url)) continue;
      seen.add(job.url);
      jobs.push(job);
    }
  });

  return { jobs, results };
}
