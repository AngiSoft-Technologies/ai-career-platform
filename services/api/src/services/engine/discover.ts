/**
 * Self-expanding discovery.
 *
 * The fixed feeds in `sources.ts` only bootstrap the system. This module is
 * what makes coverage grow without us editing a list:
 *
 *   1. ATS expansion — the moment any discovered URL points at Greenhouse,
 *      Lever, Ashby, Workable, SmartRecruiters or Recruitee, we fetch that
 *      company's *entire* public board. One job discovered ⇒ every job at
 *      that company discovered.
 *   2. Careers-page discovery — for any new company domain, follow its
 *      homepage to /careers, /jobs, work-with-us, etc., then collect the job
 *      links it exposes.
 *   3. Sitemap discovery — read robots.txt and sitemap.xml for job URLs.
 *   4. Query generation — build search queries from user skills, roles,
 *      countries and the domains we have already learned about.
 *
 * Everything uses public endpoints and our own fetcher. No keys.
 */

import { logger } from "../../logger.js";
import { fetchJson, scrapeUrl } from "./fetch.js";
import { extractJobPostingsJsonLd, htmlToMarkdown } from "./html.js";
import type { RawJob } from "./sources.js";

export type AtsKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "smartrecruiters"
  | "recruitee"
  | "workday"
  | "oracle";

export interface AtsBoard {
  kind: AtsKind;
  token: string;
}

const ATS_PATTERNS: Array<{ kind: AtsKind; regex: RegExp; tokenIndex: number }> = [
  { kind: "greenhouse", regex: /(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i, tokenIndex: 1 },
  { kind: "lever", regex: /jobs\.lever\.co\/([^/?#]+)/i, tokenIndex: 1 },
  { kind: "ashby", regex: /jobs\.ashbyhq\.com\/([^/?#]+)/i, tokenIndex: 1 },
  { kind: "workable", regex: /apply\.workable\.com\/([^/?#]+)/i, tokenIndex: 1 },
  { kind: "smartrecruiters", regex: /jobs\.smartrecruiters\.com\/([^/?#]+)/i, tokenIndex: 1 },
  { kind: "recruitee", regex: /([a-z0-9-]+)\.recruitee\.com/i, tokenIndex: 1 },
];

function detectWorkday(rawUrl: string): AtsBoard | null {
  // https://{tenant}.wd{n}.myworkdayjobs.com/{locale}/{site}/job/...
  const match =
    /^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/i.exec(
      rawUrl,
    );
  if (!match?.[1] || !match[2] || !match[3]) return null;
  if (match[3].toLowerCase() === "wday") return null;
  return { kind: "workday", token: `${match[1]}|${match[2]}|${match[3]}` };
}

function detectOracle(rawUrl: string): AtsBoard | null {
  // https://{host}/hcmUI/CandidateExperience/{lang}/sites/{site}/...
  const match =
    /^https?:\/\/([^/]+)\/hcmUI\/CandidateExperience\/[^/]+\/sites\/([^/?#]+)/i.exec(rawUrl);
  if (!match?.[1] || !match[2]) return null;
  return { kind: "oracle", token: `${match[1]}|${match[2]}` };
}

export function detectAts(rawUrl: string): AtsBoard | null {
  for (const pattern of ATS_PATTERNS) {
    const match = pattern.regex.exec(rawUrl);
    const token = match?.[pattern.tokenIndex];
    if (token && token !== "jobs" && token !== "api") {
      return { kind: pattern.kind, token };
    }
  }
  return detectWorkday(rawUrl) ?? detectOracle(rawUrl);
}

function prettify(token: string): string {
  return token
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function toDescription(html: string | null | undefined): string {
  if (!html) return "";
  return htmlToMarkdown(decodeEntities(html), { onlyMainContent: false }).slice(0, 12_000);
}

function workMode(text: string, isRemote?: boolean): "remote" | "hybrid" | "onsite" {
  if (isRemote === true) return "remote";
  const lower = text.toLowerCase();
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("remote") || lower.includes("anywhere")) return "remote";
  return "onsite";
}

function employment(value: string | undefined | null): string {
  const lower = (value ?? "").toLowerCase();
  if (lower.includes("part")) return "part_time";
  if (lower.includes("contract")) return "contract";
  if (lower.includes("intern")) return "internship";
  if (lower.includes("freelance")) return "freelance";
  return "full_time";
}

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date =
    typeof value === "number"
      ? new Date(value > 1e12 ? value : value * 1000)
      : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// ATS adapters
// ---------------------------------------------------------------------------

interface GreenhouseJob {
  id?: number;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  content?: string;
  location?: { name?: string };
  metadata?: Array<{ name?: string; value?: unknown }>;
}

async function greenhouseBoard(token: string): Promise<RawJob[]> {
  const payload = await fetchJson<{ jobs?: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
  );
  return (payload.jobs ?? [])
    .filter((job) => job.title && job.absolute_url)
    .map((job) => {
      const description = toDescription(job.content);
      const location = job.location?.name ?? null;
      const remote = /remote|anywhere/i.test(location ?? "");
      return {
        sourcePlatform: `greenhouse:${token}`,
        externalId: String(job.id ?? job.absolute_url),
        url: job.absolute_url!,
        applyUrl: job.absolute_url!,
        title: job.title!.trim(),
        company: prettify(token),
        description,
        location,
        country: null,
        city: location,
        workMode: workMode(`${location ?? ""} ${description}`, remote),
        employmentType: employment(description),
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: dateOrNull(job.updated_at),
        skills: [],
        raw: job as unknown as Record<string, unknown>,
      } satisfies RawJob;
    });
}

interface LeverJob {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  descriptionPlain?: string;
  categories?: { location?: string; commitment?: string; team?: string };
  salaryRange?: { min?: number; max?: number; currency?: string };
}

async function leverBoard(token: string): Promise<RawJob[]> {
  const payload = await fetchJson<LeverJob[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
  );
  return (Array.isArray(payload) ? payload : [])
    .filter((job) => job.text && job.hostedUrl)
    .map((job) => ({
      sourcePlatform: `lever:${token}`,
      externalId: job.id ?? job.hostedUrl!,
      url: job.hostedUrl!,
      applyUrl: job.applyUrl ?? job.hostedUrl!,
      title: job.text!.trim(),
      company: prettify(token),
      description: job.descriptionPlain ?? "",
      location: job.categories?.location ?? null,
      country: null,
      city: job.categories?.location ?? null,
      workMode: workMode(`${job.categories?.location ?? ""} ${job.text ?? ""}`),
      employmentType: employment(job.categories?.commitment),
      salaryMin: job.salaryRange?.min ?? null,
      salaryMax: job.salaryRange?.max ?? null,
      currency: job.salaryRange?.currency ?? null,
      postedAt: dateOrNull(job.createdAt),
      skills: [],
      raw: job as unknown as Record<string, unknown>,
    }));
}

interface AshbyJob {
  id?: string;
  title?: string;
  location?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  applyUrl?: string;
  jobUrl?: string;
  publishedAt?: string;
  employmentType?: string;
  isRemote?: boolean;
  compensation?: { summary?: string };
}

async function ashbyBoard(token: string): Promise<RawJob[]> {
  const payload = await fetchJson<{ jobs?: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`,
  );
  return (payload.jobs ?? [])
    .filter((job) => job.title && (job.jobUrl || job.applyUrl))
    .map((job) => ({
      sourcePlatform: `ashby:${token}`,
      externalId: job.id ?? job.jobUrl ?? job.applyUrl!,
      url: job.jobUrl ?? job.applyUrl!,
      applyUrl: job.applyUrl ?? job.jobUrl!,
      title: job.title!.trim(),
      company: prettify(token),
      description:
        job.descriptionPlain ?? toDescription(job.descriptionHtml) ?? "",
      location: job.location ?? null,
      country: null,
      city: job.location ?? null,
      workMode: workMode(`${job.location ?? ""}`, job.isRemote),
      employmentType: employment(job.employmentType),
      salaryMin: null,
      salaryMax: null,
      currency: null,
      postedAt: dateOrNull(job.publishedAt),
      skills: [],
      raw: job as unknown as Record<string, unknown>,
    }));
}

interface WorkableJob {
  id?: string;
  shortcode?: string;
  title?: string;
  url?: string;
  application_url?: string;
  description?: string;
  created_at?: string;
  type?: string;
  remote?: boolean;
  location?: { city?: string; country?: string };
}

async function workableBoard(token: string): Promise<RawJob[]> {
  const payload = await fetchJson<{ jobs?: WorkableJob[] }>(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`,
  );
  return (payload.jobs ?? [])
    .filter((job) => job.title && (job.url || job.shortcode))
    .map((job) => {
      const url = job.url ?? `https://apply.workable.com/${token}/j/${job.shortcode}`;
      const location = [job.location?.city, job.location?.country].filter(Boolean).join(", ");
      return {
        sourcePlatform: `workable:${token}`,
        externalId: job.shortcode ?? job.id ?? url,
        url,
        applyUrl: job.application_url ?? url,
        title: job.title!.trim(),
        company: prettify(token),
        description: toDescription(job.description),
        location: location || null,
        country: job.location?.country ?? null,
        city: job.location?.city ?? null,
        workMode: workMode(`${location} ${job.title}`, job.remote),
        employmentType: employment(job.type),
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: dateOrNull(job.created_at),
        skills: [],
        raw: job as unknown as Record<string, unknown>,
      } satisfies RawJob;
    });
}

interface SmartRecruitersPosting {
  id?: string;
  name?: string;
  ref?: string;
  releasedDate?: string;
  location?: { city?: string; country?: string; remote?: boolean };
  company?: { name?: string; identifier?: string };
  jobAd?: { sections?: Record<string, { text?: string }> };
  typeOfEmployment?: { label?: string };
}

async function smartRecruitersBoard(token: string): Promise<RawJob[]> {
  const payload = await fetchJson<{ content?: SmartRecruitersPosting[] }>(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100`,
  );
  return (payload.content ?? [])
    .filter((job) => job.name && job.id)
    .map((job) => {
      const sections = job.jobAd?.sections ?? {};
      const description = Object.values(sections)
        .map((section) => toDescription(section.text))
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 12_000);
      const location = [job.location?.city, job.location?.country].filter(Boolean).join(", ");
      return {
        sourcePlatform: `smartrecruiters:${token}`,
        externalId: job.id!,
        url: `https://jobs.smartrecruiters.com/${token}/${job.id}`,
        applyUrl: `https://jobs.smartrecruiters.com/${token}/${job.id}`,
        title: job.name!.trim(),
        company: job.company?.name ?? prettify(token),
        description,
        location: location || null,
        country: job.location?.country ?? null,
        city: job.location?.city ?? null,
        workMode: workMode(location, job.location?.remote),
        employmentType: employment(job.typeOfEmployment?.label),
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: dateOrNull(job.releasedDate),
        skills: [],
        raw: job as unknown as Record<string, unknown>,
      } satisfies RawJob;
    });
}

interface RecruiteeOffer {
  id?: number;
  title?: string;
  careers_url?: string;
  description?: string;
  created_at?: string;
  employment_type_code?: string;
  remote?: boolean;
  city?: string;
  country_code?: string;
}

async function recruiteeBoard(token: string): Promise<RawJob[]> {
  const payload = await fetchJson<{ offers?: RecruiteeOffer[] }>(
    `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`,
  );
  return (payload.offers ?? [])
    .filter((job) => job.title && job.careers_url)
    .map((job) => ({
      sourcePlatform: `recruitee:${token}`,
      externalId: String(job.id ?? job.careers_url),
      url: job.careers_url!,
      applyUrl: job.careers_url!,
      title: job.title!.trim(),
      company: prettify(token),
      description: toDescription(job.description),
      location: [job.city, job.country_code].filter(Boolean).join(", ") || null,
      country: job.country_code ?? null,
      city: job.city ?? null,
      workMode: workMode(`${job.city ?? ""} ${job.title}`, job.remote),
      employmentType: employment(job.employment_type_code),
      salaryMin: null,
      salaryMax: null,
      currency: null,
      postedAt: dateOrNull(job.created_at),
      skills: [],
      raw: job as unknown as Record<string, unknown>,
    }));
}

interface WorkdayJob {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

async function workdayBoard(token: string): Promise<RawJob[]> {
  const [tenant, pod, site] = token.split("|");
  if (!tenant || !pod || !site) return [];

  const endpoint = `https://${tenant}.${pod}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const payload = await fetchJson<{ jobPostings?: WorkdayJob[]; total?: number }>(
    endpoint,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: "",
      }),
    },
  );

  const origin = `https://${tenant}.${pod}.myworkdayjobs.com`;
  return (payload.jobPostings ?? [])
    .filter((job) => job.title && job.externalPath)
    .map((job) => {
      const url = new URL(job.externalPath!, origin).toString();
      const location = job.locationsText ?? null;
      const description = [
        job.title,
        location,
        ...(job.bulletFields ?? []),
      ]
        .filter(Boolean)
        .join("\n");
      return {
        sourcePlatform: `workday:${tenant}`,
        externalId: job.externalPath!,
        url,
        applyUrl: url,
        title: job.title!.trim(),
        company: prettify(tenant),
        description,
        location,
        country: null,
        city: location,
        workMode: workMode(`${location ?? ""} ${job.title}`),
        employmentType: "full_time",
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: parsePostedOn(job.postedOn),
        skills: [],
        raw: job as unknown as Record<string, unknown>,
      } satisfies RawJob;
    });
}

/** Workday uses "Posted Today", "Posted 3 Days Ago", "Posted 30+ Days Ago". */
function parsePostedOn(value: string | undefined): Date | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes("today")) return new Date();
  if (lower.includes("yesterday")) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  }
  const days = /(\d+)\s*\+?\s*day/.exec(lower);
  if (days?.[1]) {
    const date = new Date();
    date.setDate(date.getDate() - Number(days[1]));
    return date;
  }
  return dateOrNull(value);
}

interface OracleRequisition {
  Id?: string;
  Title?: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  PostedDate?: string;
  WorkplaceType?: string;
  ShortDescriptionStr?: string;
  SecondaryLocations?: Array<{ LocationName?: string }>;
}

const COUNTRY_NAMES: Record<string, string> = {
  KE: "Kenya", NG: "Nigeria", ZA: "South Africa", GH: "Ghana", EG: "Egypt",
  ET: "Ethiopia", TZ: "Tanzania", UG: "Uganda", RW: "Rwanda", MA: "Morocco",
  SN: "Senegal", CM: "Cameroon", CI: "Côte d'Ivoire", ZW: "Zimbabwe",
  ZM: "Zambia", BW: "Botswana", NA: "Namibia", MZ: "Mozambique", AO: "Angola",
  MW: "Malawi", SO: "Somalia", SD: "Sudan", TN: "Tunisia", DZ: "Algeria",
  US: "United States", GB: "United Kingdom", DE: "Germany", FR: "France",
  NL: "Netherlands", IN: "India", AE: "United Arab Emirates", CA: "Canada",
};

const oracleCompanyCache = new Map<string, string>();

/** Oracle HCM hides the employer name in the API; the careers page has it. */
async function oracleCompany(host: string, site: string): Promise<string> {
  const key = `${host}|${site}`;
  const cached = oracleCompanyCache.get(key);
  if (cached) return cached;

  const landing = await scrapeUrl(
    `https://${host}/hcmUI/CandidateExperience/en/sites/${site}`,
    { onlyMainContent: false },
  ).catch(() => null);

  const raw =
    landing?.metadata.ogSiteName ??
    landing?.metadata.title ??
    landing?.markdown.split("\n").find((line) => line.trim().length > 0) ??
    "";

  const name = raw
    .replace(/\s*[|\-–—]\s*(careers?|jobs?|job search|home).*$/i, "")
    .replace(/\s*(careers?|jobs?)\s*$/i, "")
    .trim();

  if (name) oracleCompanyCache.set(key, name);
  return name || prettify(host.split(".")[0] ?? "Company");
}

async function oracleBoard(token: string): Promise<RawJob[]> {
  const [host, site] = token.split("|");
  if (!host || !site) return [];

  const finder = [
    `findReqs;siteNumber=${site}`,
    "facetsList=LOCATIONS;WORK_LOCATIONS;WORKPLACE_TYPES;TITLES;CATEGORIES;ORGANIZATIONS;POSTING_DATES;FLEX_FIELDS",
    "limit=50",
    "offset=0",
    "sortBy=POSTING_DATES_DESC",
  ].join(",");

  const endpoint =
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURIComponent(finder)}`;

  const payload = await fetchJson<{
    items?: Array<{ requisitionList?: OracleRequisition[] }>;
  }>(endpoint, { headers: { Accept: "application/json" } });

  const list = (payload.items ?? []).flatMap((item) => item.requisitionList ?? []);
  if (list.length === 0) return [];

  const company = await oracleCompany(host, site);

  return list
    .filter((job) => job.Id && job.Title)
    .map((job) => {
      const url = `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${job.Id}`;
      const location =
        [job.PrimaryLocation, ...(job.SecondaryLocations ?? []).map((entry) => entry.LocationName)]
          .filter(Boolean)
          .join(", ") || null;
      const description = htmlToMarkdown(job.ShortDescriptionStr ?? "", {
        onlyMainContent: false,
      }).slice(0, 12_000);
      return {
        sourcePlatform: "oracle",
        externalId: job.Id!,
        url,
        applyUrl: url,
        title: job.Title!.trim(),
        company,
        description: description || job.Title!,
        location,
        country: job.PrimaryLocationCountry
          ? COUNTRY_NAMES[job.PrimaryLocationCountry] ?? job.PrimaryLocationCountry
          : null,
        city: job.PrimaryLocation ?? null,
        workMode: workMode(`${job.WorkplaceType ?? ""} ${location ?? ""}`),
        employmentType: "full_time",
        salaryMin: null,
        salaryMax: null,
        currency: null,
        postedAt: dateOrNull(job.PostedDate),
        skills: [],
        raw: job as unknown as Record<string, unknown>,
      } satisfies RawJob;
    });
}

export async function fetchAtsBoard(board: AtsBoard): Promise<RawJob[]> {
  switch (board.kind) {
    case "greenhouse":
      return greenhouseBoard(board.token);
    case "lever":
      return leverBoard(board.token);
    case "ashby":
      return ashbyBoard(board.token);
    case "workable":
      return workableBoard(board.token);
    case "smartrecruiters":
      return smartRecruitersBoard(board.token);
    case "recruitee":
      return recruiteeBoard(board.token);
    case "workday":
      return workdayBoard(board.token);
    case "oracle":
      return oracleBoard(board.token);
    default:
      return [];
  }
}

/**
 * Generic harvest for any job-listing page: reads every schema.org JobPosting
 * block on it. This is how careers indexes that publish structured data are
 * ingested without a site-specific adapter.
 */
export function extractListingJobs(html: string, baseUrl: string): RawJob[] {
  return extractJobPostingsJsonLd(html)
    .filter((posting) => posting.title)
    .map((posting, index) => {
      let url = baseUrl;
      if (posting.applyUrl) {
        try {
          url = new URL(posting.applyUrl, baseUrl).toString();
        } catch {
          // Keep the listing URL.
        }
      }
      return {
        sourcePlatform: "listing",
        externalId: url === baseUrl ? `${baseUrl}#${index}` : url,
        url,
        applyUrl: url,
        title: posting.title!.slice(0, 300),
        company: posting.company ?? null,
        description: posting.description ?? posting.title!,
        location: posting.location ?? null,
        country: posting.country ?? null,
        city: posting.city ?? null,
        workMode: (posting.workMode as RawJob["workMode"]) ?? workMode(posting.location ?? ""),
        employmentType: employment(posting.employmentType),
        salaryMin: posting.salaryMin ?? null,
        salaryMax: posting.salaryMax ?? null,
        currency: posting.currency ?? null,
        postedAt: dateOrNull(posting.datePosted),
        skills: [],
      } satisfies RawJob;
    });
}

// ---------------------------------------------------------------------------
// Careers pages + sitemaps
// ---------------------------------------------------------------------------

const CAREER_LINK_PATTERN = /(careers?|jobs?|vacanc|work[-_ ]?with[-_ ]?us|join[-_ ]?us|opportunit)/i;
const JOB_URL_PATTERN =
  /(job|vacanc|career|position|opening|role|apply|posting)[/-][^/]*\d|[0-9a-f]{8}-[0-9a-f-]{20,}/i;

export function findCareerLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const label = match[2]?.replace(/<[^>]+>/g, " ").trim() ?? "";
    if (!href) continue;
    if (!CAREER_LINK_PATTERN.test(`${href} ${label}`)) continue;
    try {
      const absolute = new URL(href, baseUrl);
      if (absolute.protocol !== "http:" && absolute.protocol !== "https:") continue;
      if (/\.(css|js|png|jpg|jpeg|svg|webp|gif|pdf|zip)$/i.test(absolute.pathname)) continue;
      links.add(absolute.toString());
    } catch {
      // Ignore malformed hrefs.
    }
  }
  return [...links].slice(0, 8);
}

export function findJobLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const regex = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;
    try {
      const absolute = new URL(href, baseUrl);
      if (absolute.protocol !== "http:" && absolute.protocol !== "https:") continue;
      if (!JOB_URL_PATTERN.test(absolute.pathname)) continue;
      if (absolute.pathname.split("/").filter(Boolean).length < 2) continue;
      links.add(absolute.toString());
    } catch {
      // Ignore.
    }
  }
  return [...links].slice(0, 30);
}

export function findAtsLinks(html: string, baseUrl: string): AtsBoard[] {
  const boards = new Map<string, AtsBoard>();
  const regex = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const board = detectAts(absolute);
    if (board) boards.set(`${board.kind}:${board.token}`, board);
  }
  return [...boards.values()];
}

/** Discovers job links from a company homepage. */
export async function discoverFromDomainDetailed(domain: string): Promise<{
  links: string[];
  jobs: RawJob[];
  ats: AtsBoard[];
}> {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  let homepage: Awaited<ReturnType<typeof scrapeUrl>>;
  try {
    homepage = await scrapeUrl(base, { onlyMainContent: false });
  } catch (error) {
    logger.debug({ domain, error }, "Careers discovery: homepage failed");
    return { links: [], jobs: [], ats: [] };
  }

  const careerLinks = findCareerLinks(homepage.html, homepage.finalUrl);
  const jobLinks = new Set<string>(findJobLinks(homepage.html, homepage.finalUrl));
  const jobs = new Map<string, RawJob>();
  const ats = new Map<string, AtsBoard>();

  const absorb = (page: { html: string; finalUrl: string }) => {
    // Any ATS link on the page is a board we can pull wholesale.
    for (const board of findAtsLinks(page.html, page.finalUrl)) {
      ats.set(`${board.kind}:${board.token}`, board);
    }
    // Listing pages often publish structured data for every open role.
    for (const job of extractListingJobs(page.html, page.finalUrl)) {
      jobs.set(job.url, job);
    }
  };

  absorb(homepage);

  for (const link of careerLinks.slice(0, 4)) {
    try {
      const page = await scrapeUrl(link, { onlyMainContent: false });
      absorb(page);
      for (const jobLink of findJobLinks(page.html, page.finalUrl)) {
        jobLinks.add(jobLink);
      }
      if (jobLinks.size >= 30) break;
    } catch {
      // Keep whatever we have.
    }
  }

  return {
    links: [...jobLinks].slice(0, 30),
    jobs: [...jobs.values()].slice(0, 100),
    ats: [...ats.values()].slice(0, 6),
  };
}

export async function discoverFromDomain(domain: string): Promise<string[]> {
  return (await discoverFromDomainDetailed(domain)).links;
}

export async function discoverFromSitemap(domain: string): Promise<string[]> {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const sitemapCandidates = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];
  const found = new Set<string>();

  for (const sitemap of sitemapCandidates) {
    try {
      const page = await scrapeUrl(sitemap, { onlyMainContent: false });
      const urls = [...page.html.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1]!);
      for (const url of urls) {
        if (JOB_URL_PATTERN.test(url) || /\/jobs?\//i.test(url)) {
          found.add(url);
        }
        if (found.size >= 40) return [...found];
      }
      // Follow one level of sitemap indexes.
      for (const url of urls.filter((value) => value.endsWith(".xml")).slice(0, 3)) {
        try {
          const child = await scrapeUrl(url, { onlyMainContent: false });
          for (const loc of child.html.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
            if (JOB_URL_PATTERN.test(loc[1]!) || /\/jobs?\//i.test(loc[1]!)) {
              found.add(loc[1]!);
            }
          }
        } catch {
          // Ignore child sitemap failures.
        }
      }
    } catch {
      // No sitemap; that is normal.
    }
  }

  return [...found].slice(0, 40);
}

// ---------------------------------------------------------------------------
// Query generation
// ---------------------------------------------------------------------------

export interface QuerySeeds {
  roles: string[];
  skills: string[];
  countries: string[];
  knownDomains: string[];
}

/**
 * Builds a rotating query set from real user demand and learned sources.
 * This is the opposite of a hardcoded list: it changes as users and data
 * change, and it keeps exploring new sites every cycle.
 */
export function buildDiscoveryQueries(seeds: QuerySeeds): string[] {
  const roles = [...new Set(seeds.roles.map((role) => role.trim()).filter(Boolean))].slice(0, 8);
  const skills = [...new Set(seeds.skills.map((skill) => skill.trim()).filter(Boolean))].slice(0, 6);
  const countries = [...new Set(seeds.countries.map((country) => country.trim()).filter(Boolean))].slice(0, 4);
  const domains = [...new Set(seeds.knownDomains.map((domain) => domain.trim()).filter(Boolean))];

  const queries = new Set<string>();

  for (const role of roles) {
    for (const country of countries.length > 0 ? countries : ["Africa"]) {
      queries.add(`"${role}" jobs ${country} hiring`);
      queries.add(`"${role}" remote ${country}`);
    }
  }

  for (const skill of skills) {
    queries.add(`"${skill}" remote job Africa`);
  }

  // Exploration: force the engine to surface sites we have never seen.
  queries.add(`"careers" "we are hiring" Africa remote`);
  queries.add(`"job openings" Kenya remote -site:linkedin.com -site:facebook.com`);
  queries.add(`"apply now" "remote" "Africa" -site:linkedin.com`);

  // Exploit: re-check learned domains that produce real jobs.
  const rotated = domains.sort(() => Math.random() - 0.5).slice(0, 5);
  for (const domain of rotated) {
    queries.add(`site:${domain} jobs`);
  }

  return [...queries].slice(0, 24);
}
