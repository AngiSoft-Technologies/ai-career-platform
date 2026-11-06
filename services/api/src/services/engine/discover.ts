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
import { browserHeaders, egressFetch } from "./egress.js";
import {
  decodeEntities,
  extractJobPostingsJsonLd,
  htmlToMarkdown,
} from "./html.js";
import { normaliseCompanyName } from "./company.js";
import { detectAts, type AtsBoard, type AtsKind } from "./ats.js";
import type { RawJob } from "./sources.js";

export { detectAts } from "./ats.js";
export type { AtsBoard, AtsKind } from "./ats.js";

/**
 * A token made readable.
 *
 * "weloglobal" is "Welo Global" — a guess, but a good one, and it is
 * replaced by the board's own page when the board is read.
 */
function prettify(token: string): string {
  return token
    .replace(/[-_]+/g, " ")
    // A name written as one word is often two words: "WorldVision
    // International", "BetwayAfrica". The capitals are where the words
    // start, and the employer's name is written with them.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

/**
 * The board's own page.
 *
 * The board's URL token is a slug the board was given — "weloglobal" —
 * and turning that into a name ("Weloglobal") is a guess. The board's
 * page knows the employer's name: its title is "Welo Global".
 */
async function boardPageUrl(board: AtsBoard): Promise<string | null> {
  const token = board.token;
  switch (board.kind) {
    case "lever":
      return `https://jobs.lever.co/${encodeURIComponent(token)}`;
    case "greenhouse":
      return `https://boards.greenhouse.io/${encodeURIComponent(token)}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${encodeURIComponent(token)}`;
    case "workable":
      return `https://apply.workable.com/${encodeURIComponent(token)}/`;
    case "smartrecruiters":
      return `https://jobs.smartrecruiters.com/${encodeURIComponent(token)}`;
    case "recruitee":
      return `https://${token}.recruitee.com`;
    case "workday": {
      const [tenant, wd, site] = token.split("|");
      if (!tenant || !wd) return null;
      const origin = `https://${tenant}.${wd}.myworkdayjobs.com`;
      // The tenant's own file names the sites it publishes under, so a
      // board that does not name one is asked for rather than guessed
      // at: "alliancewd" publishes under "renault-group-careers".
      const known = site || (await workdaySitePaths(origin))[0];
      if (!known) return null;
      return `${origin}/${known}`;
    }
    case "oracle": {
      const [host, site] = token.split("|");
      if (!host || !site) return null;
      return `https://${host}/hcmUI/CandidateExperience/en/sites/${site}`;
    }
    default:
      return null;
  }
}

/**
 * The words a board puts in front of the employer's name.
 *
 * Workday writes its board's title as "Careers | Renault Group" — the
 * board's own word, then the employer's. Oracle writes "Centific|Wd1|
 * Centific Global", where the employer's name is in the middle. So
 * the segments are read in order and the first one that is not the
 * board talking about itself is the employer's.
 */
const BOARD_WORDS = new Set([
  "careers",
  "career site",
  "careers site",
  "jobs",
  "job search",
  "search jobs",
  "search job",
  "home",
  "join our team",
  "join us",
  "work with us",
  "vacancies",
  "external",
  "candidate experience",
  "candidate experience site",
  "wd",
]);

/**
 * The employer's name, as the board's title writes it.
 */
export function employerSegment(title: string | null | undefined): string | null {
  if (!title) return null;

  const parts = title
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return title;

  for (const part of parts) {
    if (!BOARD_WORDS.has(part.toLowerCase())) return part;
  }
  return parts[0] ?? null;
}

/**
 * The employer's name, as Workday's board writes it.
 *
 * Workday's boards are the least generous of the vendors. Their title
 * is often the board's own word — "Careers", or nothing at all — and
 * the employer's name is in the page's description instead:
 * "Tiger Brands is proudly Africa's largest listed manufacturer of
 * fast-moving consumer goods."
 *
 * So the name is looked for in three places, in order of how much they
 * can be trusted:
 *
 *   1. the title — "Careers | Renault Group", "Job Openings at WFP";
 *   2. the description's own opening — the employer naming itself;
 *   3. the name the site is published under — "Betway_Africa" is
 *      Betway Africa, and "renault-group-careers" is Renault Group.
 *
 * The third is a guess, and it is the last one: a board that says
 * nothing at all still has a name, and a name that is nearly right is
 * better than a tenant's address.
 */
async function workdayEmployerName(
  origin: string,
  site: string,
): Promise<string | null> {
  const page = await scrapeUrl(`${origin}/${site}`, { onlyMainContent: false }).catch(
    () => null,
  );

  if (page) {
    const title = page.metadata?.ogTitle ?? page.metadata?.title ?? null;
    const segment = employerSegment(title);
    if (segment) {
      // "Job Openings at WFP" — the employer's name is after the "at".
      const afterAt = /\bat\s+(.+)$/i.exec(segment)?.[1];
      const fromTitle = normaliseCompanyName(afterAt ?? segment);
      if (fromTitle) return fromTitle;
    }

    const description = page.metadata?.ogDescription ?? "";
    // "Tiger Brands is proudly Africa's largest…"
    const subject =
      /^([A-Z][\w&'’.()-]*(?:\s+[A-Z][\w&'’.()-]*){0,4})\s+(?:is|are|has|have|was|were)\b/.exec(
        description,
      )?.[1];
    if (subject) {
      const fromDescription = normaliseCompanyName(subject);
      if (fromDescription) return fromDescription;
    }

    // "…the Gates Foundation works to help all people…"
    const named =
      /\bthe\s+([A-Z][\w&'’.()-]*(?:\s+[A-Z][\w&'’.()-]*){0,3})\s+(?:works|is|has|provides|helps|seeks|offers|serves)\b/.exec(
        description,
      )?.[1];
    if (named) {
      const fromDescription = normaliseCompanyName(named);
      if (fromDescription) return fromDescription;
    }
  }

  // The name the site is published under.
  const fromSite = normaliseCompanyName(prettify(site));
  if (fromSite) return fromSite;

  return null;
}

/**
 * The employer's name, as the board writes it.
 *
 * A token with a separator in it ("acme-corp") already makes a
 * readable name, and no request is needed. A single run-on token
 * ("weloglobal") makes a guess, and one request to the board's own page
 * buys the right name for every posting on it — the page cache holds it
 * for the next cycle.
 *
 * Two kinds of board are addressed rather than named, and their tokens
 * are addresses, not names: Oracle ("host|site") and Workday
 * ("tenant|pod|site"). A site id reads as words — "CX_3001" — and
 * used to be taken for the employer's name, so KCB Group's roles were
 * written under "Eoin.Fa.Em3.Oraclecloud.Com|CX 3001".
 *
 * So for those two the board's page is always read, and its title is
 * read the way they write it: the employer's name first, then the
 * board's own address — "KCB Group", "Centific|Wd1|Centific Global".
 */
async function boardEmployerName(board: AtsBoard): Promise<string | null> {
  // A token with a separator in it ("acme-corp") already makes a
  // readable name, and no request is needed. A single run-on token
  // ("weloglobal") makes a guess, and one request to the board's own page
  // buys the right name for every posting on it — the page cache holds it
  // for the next cycle.
  const addressed = board.kind === "oracle" || board.kind === "workday";
  const rawToken = addressed
    ? (board.token.split("|")[0] ?? board.token)
    : board.token;
  const fallback = normaliseCompanyName(prettify(rawToken)) ?? prettify(rawToken);
  // A token that reads as words is good enough on its own — unless it
  // is an address, which never is.
  if (!addressed && /[-_]/.test(board.token)) return fallback;

  // Workday writes its boards differently from the others, and its own
  // reader knows how to ask it: the title is often the board's word and
  // the employer's name is in the description.
  if (board.kind === "workday") {
    const [tenant, wd, site] = board.token.split("|");
    if (!tenant || !wd) return null;
    const origin = `https://${tenant}.${wd}.myworkdayjobs.com`;
    const known = site || (await workdaySitePaths(origin))[0];
    if (!known) return null;

    const name = await workdayEmployerName(origin, known);
    if (name) return name;

    // The tenant's own name, which is a guess but a close one: the
    // tenant is named after the employer.
    const fromTenant = normaliseCompanyName(prettify(tenant));
    return fromTenant ?? null;
  }

  const page = await boardPageUrl(board);
  if (!page) return addressed ? null : fallback;

  try {
    const scraped = await scrapeUrl(page, { onlyMainContent: false });
    const title =
      scraped.metadata?.ogSiteName ??
      scraped.metadata?.title ??
      scraped.metadata?.ogTitle ??
      null;
    const first = addressed ? employerSegment(title) : title;
    const name = normaliseCompanyName(first);
    if (name) return name;
  } catch (error) {
    logger.debug(
      { board: board.kind, token: board.token, error },
      "Board name lookup failed; using the token",
    );
  }

  // An addressed board's token is an address, and an address is not an
  // employer's name: "Erey.Fa.Em3.Oraclecloud.Com" is Airtel Africa.
  // So when the page cannot be read, the board's own reader is left to
  // name the employer — for Oracle, that is the employer's own name in
  // the requisition.
  return addressed ? null : fallback;
}

/**
 * The employer's name, as the board's page writes it.
 *
 * Exported so a repair can ask the same question the pipeline asks:
 * a tenant-address row in the catalogue ("Erey.Fa.Em3.Oraclecloud.Com")
 * is Airtel Africa, and only the board's page knows that.
 */
export async function boardEmployer(board: AtsBoard): Promise<string | null> {
  return boardEmployerName(board);
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

/**
 * The site names a Workday board is usually published under.
 *
 * The board's URL carries the site name — ".../en-US/External/job/…"
 * — but not always: some employers publish at ".../job/…", where the
 * site is implicit and the address alone does not say which one it
 * is.
 *
 * So the name in the address is tried first, and the tenant's own
 * robots.txt is asked after it — that file names every site the tenant
 * publishes under ("Allow: /Centific_Global/", "Sitemap: …/Centific_Global/siteMap.xml").
 *
 * One request to learn the name, and no guessing.
 */
async function workdaySitePaths(origin: string): Promise<string[]> {
  try {
    const response = await egressFetch(`${origin}/robots.txt`, {
      method: "GET",
      headers: browserHeaders({ Accept: "text/plain,*/*" }),
    });
    if (response.status < 200 || response.status >= 300) return [];

    const text = new TextDecoder().decode(response.body);
    const names = new Set<string>();

    for (const line of text.split("\n")) {
      const sitemap = /^sitemap:\s*https?:\/\/[^/\s]+\/([^/\s]+)\/sitemap\.xml/i.exec(
        line.trim(),
      );
      if (sitemap?.[1]) names.add(sitemap[1]);

      const allow = /^allow:\s*\/([^/\s]+)\//i.exec(line.trim());
      if (allow?.[1]) names.add(allow[1]);
    }

    // The paths that are not sites: the refresh endpoint, the posting
    // path itself, the API's own.
    return [...names].filter(
      (name) =>
        !/^(refreshfacet|wday|cxs|job|jobs|robots\.txt)$/i.test(name),
    );
  } catch {
    return [];
  }
}

/**
 * One board's postings.
 *
 * The endpoint serves twenty at a time and the board holds as many as
 * the employer put there — ninety-two, four hundred, four thousand. So
 * the board is walked, a page at a time, until it says it has no more
 * or the walk has read enough (two hundred postings is more than any
 * one employer's board needs to be useful).
 */
async function fetchWorkdayBoard(
  origin: string,
  tenant: string,
  site: string,
): Promise<WorkdayJob[]> {
  const endpoint = `${origin}/wday/cxs/${tenant}/${site}/jobs`;
  const pageSize = 20;
  const maxPages = 10;

  const postings: WorkdayJob[] = [];
  let total: number | null = null;

  for (let page = 0; page < maxPages; page++) {
    const payload = await fetchJson<{
      jobPostings?: WorkdayJob[];
      total?: number;
    }>(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: pageSize,
        offset: page * pageSize,
        searchText: "",
      }),
    });

    const batch = payload.jobPostings ?? [];
    postings.push(...batch);

    // The total is only ever reported for the first page — later pages
    // answer "0" — so it is read once and believed once.
    if (page === 0 && typeof payload.total === "number") {
      total = payload.total;
    }

    if (batch.length < pageSize) break;
    if (total !== null && postings.length >= total) break;
  }

  return postings;
}

async function workdayBoard(token: string): Promise<RawJob[]> {
  const [tenant, pod, site] = token.split("|");
  if (!tenant || !pod) return [];

  const origin = `https://${tenant}.${pod}.myworkdayjobs.com`;

  // The tenant's own file names every site it publishes under, and a
  // tenant publishes under more than one: "alliancewd" has a board for
  // the group and a board for each brand. The board is the union of
  // them, so all of them are read — up to three, which is enough to
  // cover the employers that split their careers by country.
  const sites: string[] = [];
  if (site) sites.push(site);
  for (const candidate of await workdaySitePaths(origin)) {
    if (sites.length >= 3) break;
    if (candidate === site) continue;
    sites.push(candidate);
  }

  const postings: WorkdayJob[] = [];
  let lastError: unknown = null;
  let read = 0;

  for (const candidate of sites) {
    try {
      const batch = await fetchWorkdayBoard(origin, tenant, candidate);
      read += 1;
      postings.push(...batch);
      if (read >= 3) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (read === 0) {
    // Nothing was named and nothing was found: the tenant publishes
    // its boards under a name this catalogue cannot reach. That is a
    // fact about the employer, not a failure of the cycle.
    if (lastError) throw lastError;
    return [];
  }

  return postings
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
  /** The employer, as Oracle holds it. */
  LegalEmployer?: string;
  Organization?: string;
  BusinessUnit?: string;
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

/**
 * The employer's name, as the board writes it.
 *
 * Oracle's own endpoint does not name the employer: the postings come
 * back with a title and a location, and the tenant's address says
 * nothing at all — "eoin.fa.em3.oraclecloud.com|CX_3001" is KCB Group,
 * and "erey.fa.em3.oraclecloud.com|CX_1" is Airtel Africa.
 *
 * The board's page carries the name ("Airtel Africa Careers", "KCB
 * Group"), so the page is read. It is read only once per board: the
 * name is the same for every posting on it.
 *
 * When the page cannot be read — and it cannot be read sometimes, for
 * a tenant that is slow to answer — the employer's own name in the
 * requisition is used instead: Oracle holds it in `LegalEmployer`,
 * which is the same organisation the page is about. That fallback is
 * not remembered, so the page is tried again on the next cycle: the
 * page's name is the one the employer publishes under, and the legal
 * entity's name is not always the same thing ("Safaricom PLC" and
 * "Safaricom" are one employer and two rows).
 */
async function oracleCompany(
  host: string,
  site: string,
  fallback = "",
): Promise<string> {
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
    landing?.metadata.ogTitle ??
    "";

  const name = raw
    // "Search Jobs - Central Bank of Kenya Careers" is the board's own
    // label for the page, not the employer's name.
    .replace(/^(?:search\s+jobs?|join\s+our\s+team|job\s+search|careers?)\s*[-–—|:]\s*/i, "")
    .replace(/\s*[|\-–—]\s*(careers?|jobs?|job search|home).*$/i, "")
    .replace(/\s*(careers?|jobs?)\s*$/i, "")
    .trim();

  if (name) {
    oracleCompanyCache.set(key, name);
    return name;
  }

  if (fallback) return fallback;

  return prettify(host.split(".")[0] ?? "Company");
}

/**
 * The finder that asks an Oracle board for its postings.
 *
 * The finder's own separators are semicolons. With commas, Oracle reads
 * the first part and ignores the rest — and whether the postings come
 * back at all depends on the tenant: one employer's board answered with
 * seven roles, the next answered with none, and the board was not
 * empty.
 */
export function oracleFinder(site: string): string {
  return [
    `findReqs;siteNumber=${site}`,
    "facetsList=LOCATIONS;WORK_LOCATIONS;WORKPLACE_TYPES;TITLES;CATEGORIES;ORGANIZATIONS;POSTING_DATES;FLEX_FIELDS",
    "limit=50",
    "offset=0",
    "sortBy=POSTING_DATES_DESC",
  ].join(";");
}

async function oracleBoard(token: string): Promise<RawJob[]> {
  const [host, site] = token.split("|");
  if (!host || !site) return [];

  const finder = oracleFinder(site);

  const endpoint =
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURIComponent(finder)}`;

  const payload = await fetchJson<{
    items?: Array<{ requisitionList?: OracleRequisition[] }>;
  }>(endpoint, { headers: { Accept: "application/json" } });

  const list = (payload.items ?? []).flatMap((item) => item.requisitionList ?? []);
  if (list.length === 0) return [];

  const company = await oracleCompany(
    host,
    site,
    list[0]?.LegalEmployer ?? list[0]?.Organization ?? list[0]?.BusinessUnit ?? "",
  );

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
  // The employer's name is resolved once for the whole board.
  //
  // Every posting on the board belongs to the same employer, so the
  // board is asked once and the answer is applied to all of them. The
  // postings themselves carry no employer name — a board is a list of
  // roles, and the employer's name is on the board's page.
  const employer = await boardEmployerName(board);

  const jobs = await (async (): Promise<RawJob[]> => {
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
  })();

  if (jobs.length === 0) return jobs;

  // The employer's name is applied to every posting — but only when the
  // board's page gave one. An addressed board whose page could not be
  // read keeps the name its own reader found: for Oracle, that is the
  // employer's own name in the requisition, which is better than the
  // tenant's address.
  if (!employer) return jobs;

  return jobs.map((job) => ({
    ...job,
    company: employer,
  }));
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

/**
 * What a link to one posting looks like.
 *
 * Boards publish postings in different shapes, and a rule that fits one
 * board misses the next:
 *
 *   "/job/data-analyst-cloudfactory-2"          — a number in the slug
 *   "/job/bi-analyst-at-4g-capital"             — no number at all
 *   "/jobs/companies/sinnkontor/data-scientist" — a deep path
 *
 * All three are accepted. The deep path matters because a board that
 * publishes at "/jobs/<company>/<slug>" is publishing postings at a
 * depth the shallow rule never sees, and a board that publishes at
 * "/jobs/<category>" is publishing *categories* — which the shallow
 * rule does see, and which are pages of postings rather than postings.
 *
 * The two are told apart by depth when the links are ranked, not here.
 */
const JOB_URL_PATTERN =
  /(job|vacanc|career|position|opening|role|apply|posting)[/-][^/]*\d|[0-9a-f]{8}-[0-9a-f-]{20,}|(?:job|jobs|vacanc(?:y|ies)|career|careers|position|opening|role|apply|posting)(?:\/[a-z0-9][a-z0-9-]*){2,3}\/[a-z0-9][a-z0-9-]{13,}|(?:job|jobs|vacanc(?:y|ies)|career|careers|position|opening|role|apply|posting)\/[a-z0-9][a-z0-9-]{13,}/i;

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

export function findJobLinks(
  html: string,
  baseUrl: string,
  limit = 30,
): string[] {
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
      // The fragment is not part of the page: "/jobs/data-analyst#content"
      // and "/jobs/data-analyst" are one page, and queuing both would
      // read one page twice.
      absolute.hash = "";
      // Pagination is not a page of its own: "/jobs/data-scientist" and
      // "/jobs/data-scientist?page=2" are the same listing, and the
      // second one is the same listing again.
      if (isPaginationUrl(absolute)) continue;
      links.add(absolute.toString());
    } catch {
      // Ignore.
    }
  }

  // The postings come before the pages of postings.
  //
  // A board's page carries both: "/jobs/companies/sinnkontor/data-scientist"
  // and "/jobs/data-scientist". The page of postings is worth reading
  // too, but it is worth less than the posting itself, and a limit of
  // fifteen links should be spent on the postings.
  return [...links].sort(compareJobLinks).slice(0, limit);
}

/**
 * Ranks a posting link above a page of postings.
 *
 * A link that ends in a number is a posting — "/jobs/view/data-analyst-4484357960".
 * A link that is three or four segments deep is a posting on the boards
 * that publish at "/jobs/<company>/<slug>". What is left is a page of
 * postings: "/jobs/data-scientist", "/jobs-by-title/legal".
 */
function compareJobLinks(left: string, right: string): number {
  return jobLinkRank(left) - jobLinkRank(right);
}

function jobLinkRank(url: string): number {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    if (/\d/.test(last)) return 0;
    if (segments.length >= 3) return 1;
    return 2;
  } catch {
    return 3;
  }
}

/** True when the URL is a page of the same listing rather than a new one. */
function isPaginationUrl(url: URL): boolean {
  if (!url.searchParams.has("page")) return false;
  for (const [key] of url.searchParams) {
    if (key !== "page") return false;
  }
  return true;
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
  /** The employers the catalogue was given, by name. */
  employers?: string[];
}

/**
 * Splits a taxonomy label into the roles it names.
 *
 * The profession taxonomy groups roles under one label, and the label
 * reads like a family: "Legal & Compliance", "Inside Sales & Lead
 * Generation", "Allied Health & Therapy". Quoting that whole phrase
 * asks the engine for a page containing *every* word of it, which is
 * why most of those queries came back with nothing at all.
 *
 * The label is split on the separator, and each part is searched on its
 * own: "Legal", "Compliance", "Inside Sales", "Lead Generation".
 */
export function splitRoleLabel(label: string): string[] {
  return label
    .split(/\s*(?:&|\/|\||,|\+|\band\b|\bor\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

/**
 * Builds a rotating query set from real user demand and learned sources.
 * This is the opposite of a hardcoded list: it changes as users and data
 * change, and it keeps exploring new sites every cycle.
 */
export function buildDiscoveryQueries(seeds: QuerySeeds): string[] {
  const roles = [
    ...new Set(
      seeds.roles
        .flatMap((role) => splitRoleLabel(role))
        .map((role) => role.trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);
  const skills = [...new Set(seeds.skills.map((skill) => skill.trim()).filter(Boolean))].slice(0, 6);
  const countries = [...new Set(seeds.countries.map((country) => country.trim()).filter(Boolean))].slice(0, 4);
  const domains = [...new Set(seeds.knownDomains.map((domain) => domain.trim()).filter(Boolean))];

  const queries = new Set<string>();

  for (const role of roles) {
    // A single word is quoted so the engine looks for that word; a
    // phrase is left alone, because a quoted phrase that no page
    // contains exactly returns nothing.
    const term = /\s/.test(role) ? role : `"${role}"`;
    for (const country of countries.length > 0 ? countries : ["Africa"]) {
      queries.add(`${term} jobs ${country} hiring`);
      queries.add(`${term} remote ${country}`);
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

/**
 * The queries that look for the *address* of a board.
 *
 * An employer's vacancies often exist in one place only, and that place
 * is addressed rather than named: "eoin.fa.em3.oraclecloud.com|CX_3001"
 * says nothing about KCB Group, and "jobs.lever.co/weloglobal" says
 * nothing about Welo Global. The employer's name is on the board's own
 * page, so the board is found by its address and then read.
 *
 * Oracle's boards are the clearest case. Their address is a tenant id
 * and a site id, and neither says anything about the employer, so a
 * search engine is the only thing that finds them: "Central Bank of
 * Kenya Careers" lives at "esal.fa.ocs.oraclecloud.com/hcmUI/
 * CandidateExperience/en/sites/CX_2/jobs", and nothing else on the
 * web says so.
 *
 * These are kept apart from the posting queries because they are worth
 * more: one answer is a whole employer's list of postings, in one
 * request.
 */
export function buildBoardQueries(seeds: QuerySeeds): string[] {
  const countries = [
    ...new Set(seeds.countries.map((country) => country.trim()).filter(Boolean)),
  ].slice(0, 2);
  const places = countries.length > 0 ? countries : ["Kenya"];

  const queries: string[] = [];

  // Oracle — the vendor's own name, the path that holds the board, and
  // the place.
  //
  // The phrase is not quoted, and that matters: `"hcmUI/
  // CandidateExperience" jobs Kenya` is answered by the engines with
  // something else entirely — a video, a forum, an unrelated
  // definition — while the same words unquoted bring back nine boards,
  // among them Central Bank of Kenya's and KCB Group's.
  for (const place of places) {
    queries.push(`oraclecloud.com hcmUI jobs ${place}`);
    queries.push(`oraclecloud hcmUI vacancies ${place}`);
    queries.push(`oracle cloud candidate experience careers ${place}`);
  }
  queries.push("site:oraclecloud.com hcmUI jobs");
  queries.push("oraclecloud hcmUI jobs Africa");

  // Workday — the same shape. A board's address there names the tenant
  // and the site, and the tenant's own robots.txt names every site it
  // publishes under.
  for (const place of places) {
    queries.push(`myworkdayjobs careers ${place}`);
  }
  queries.push("myworkdayjobs jobs Africa");

  // The other vendors, by their own name.
  for (const place of places) {
    queries.push(`greenhouse.io careers ${place}`);
    queries.push(`lever.co careers ${place}`);
  }

  return [...new Set(queries)];
}

/**
 * The queries that look for one employer's board by the employer's name.
 *
 * The catalogue was given nineteen employers — KCB Group, Safaricom,
 * Kenya Airways, Airtel Kenya — and their careers pages are read every
 * cycle. But most of those pages are JavaScript shells or pages that
 * answer 404, and a page that answers nothing tells the pipeline
 * nothing about where the employer posts.
 *
 * The employer's *name* is what a search engine knows: "Airtel Kenya
 * careers jobs" answers with Airtel Africa's Oracle board, and the
 * board is then read. The domain does not do this — a query with the
 * domain in it is answered with the domain's own pages, and with
 * nothing else.
 */
export function buildEmployerQueries(seeds: QuerySeeds): string[] {
  const employers = [
    ...new Set(
      (seeds.employers ?? [])
        .map((employer) => employer.trim())
        .filter((employer) => employer.length > 1),
    ),
  ];

  const queries: string[] = [];
  for (const employer of employers) {
    queries.push(`${employer} careers jobs`);
    queries.push(`${employer} vacancies openings`);
  }
  return queries;
}
