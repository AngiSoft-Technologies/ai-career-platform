import { query } from "../../db/pool.js";
import {
  assessRisk,
  certificateAgeForHost,
  type PrecomputedRiskFeatures,
  fingerprintInput,
  simhash,
  type RiskAction,
  type RiskAssessment,
  type RiskFeatures,
} from "../opportunity/risk.js";
import type { JobSourceAdapter, RawJob } from "./types.js";

const skillDictionary: Array<[RegExp, string]> = [
  [/\btypescript\b|\bts\b/i, "TypeScript"],
  [/\bjavascript\b|\bjs\b/i, "JavaScript"],
  [/\breact(\.js|js)?\b/i, "React"],
  [/\bnext\.?js\b/i, "Next.js"],
  [/\bnode(\.js)?\b/i, "Node.js"],
  [/\bflutter\b|\bdart\b/i, "Flutter"],
  [/\bkotlin\b/i, "Kotlin"],
  [/\bswift\b|\bios\b/i, "Swift"],
  [/\bandroid\b/i, "Android"],
  [/\breact native\b/i, "React Native"],
  [/\bpython\b/i, "Python"],
  [/\bdjango\b/i, "Django"],
  [/\bfastapi\b/i, "FastAPI"],
  [/\bflask\b/i, "Flask"],
  [/\bjava\b/i, "Java"],
  [/\bspring\b/i, "Spring Boot"],
  [/\bgo(lang)?\b/i, "Go"],
  [/\brust\b/i, "Rust"],
  [/\bc#|\.net\b/i, "C#/.NET"],
  [/\bphp\b/i, "PHP"],
  [/\blaravel\b/i, "Laravel"],
  [/\bpostgres(ql)?\b/i, "PostgreSQL"],
  [/\bmysql\b/i, "MySQL"],
  [/\bmongo(db)?\b/i, "MongoDB"],
  [/\bredis\b/i, "Redis"],
  [/\bsql\b/i, "SQL"],
  [/\baws\b|\bamazon web services\b/i, "AWS"],
  [/\bgcp\b|\bgoogle cloud\b/i, "GCP"],
  [/\bazure\b/i, "Azure"],
  [/\bdocker\b|\bcontainer(s|isation)?\b/i, "Docker"],
  [/\bkubernetes\b|\bk8s\b/i, "Kubernetes"],
  [/\bterraform\b/i, "Terraform"],
  [/\bci\/cd\b|\bgithub actions\b|\bjenkins\b/i, "CI/CD"],
  [/\bgraphql\b/i, "GraphQL"],
  [/\brest( apis?)?\b/i, "REST APIs"],
  [/\bgrpc\b/i, "gRPC"],
  [/\bmicroservices\b/i, "Microservices"],
  [/\bgit\b/i, "Git"],
  [/\bagile\b|\bscrum\b|\bkanban\b/i, "Agile"],
  [/\bfigma\b/i, "Figma"],
  [/\bmachine learning\b|\bml\b/i, "Machine Learning"],
  [/\bartificial intelligence\b|\bai\b/i, "AI/ML"],
  [/\bdata science\b/i, "Data Science"],
  [/\bpower ?bi\b/i, "Power BI"],
  [/\btableau\b/i, "Tableau"],
];

const seniorityKeywords: Array<[RegExp, NonNullable<RawJob["seniority"]>]> = [
  [/\b(intern|internship|graduate|trainee)\b/i, "intern"],
  [/\b(junior|entry[- ]level|associate)\b/i, "junior"],
  [/\b(senior|sr\.?|specialist)\b/i, "senior"],
  [/\b(lead|principal|staff|head of|director)\b/i, "lead"],
];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function extractSkills(job: RawJob): string[] {
  const haystack = `${job.title} ${job.description} ${job.tags.join(" ")}`;
  const found = new Set<string>();

  for (const [pattern, skill] of skillDictionary) {
    if (pattern.test(haystack)) found.add(skill);
  }

  for (const tag of job.tags) {
    const cleaned = tag.trim();
    if (cleaned.length >= 2 && cleaned.length <= 40) found.add(cleaned);
  }

  return [...found].slice(0, 12);
}

export function detectSeniority(job: RawJob): NonNullable<RawJob["seniority"]> {
  if (job.seniority) return job.seniority;
  const haystack = `${job.title} ${job.tags.join(" ")}`;
  for (const [pattern, level] of seniorityKeywords) {
    if (pattern.test(haystack)) return level;
  }
  return "mid";
}

function detectWorkMode(job: RawJob): NonNullable<RawJob["workMode"]> {
  if (job.workMode) return job.workMode;
  const haystack = `${job.title} ${job.location ?? ""} ${job.tags.join(" ")}`.toLowerCase();
  if (haystack.includes("remote")) return "remote";
  if (haystack.includes("hybrid")) return "hybrid";
  return "onsite";
}

function detectCountry(job: RawJob): string {
  if (job.country) return job.country;
  const location = (job.location ?? "").toLowerCase();
  if (location.includes("kenya") || location.includes("nairobi")) return "Kenya";
  if (location.includes("germany") || location.includes("berlin")) return "Germany";
  if (location.includes("united kingdom") || location.includes("london")) {
    return "United Kingdom";
  }
  if (location.includes("nigeria") || location.includes("lagos")) return "Nigeria";
  if (location.includes("south africa")) return "South Africa";
  if (location.includes("rwanda") || location.includes("kigali")) return "Rwanda";
  if (location.includes("uganda") || location.includes("kampala")) return "Uganda";
  if (location.includes("tanzania") || location.includes("dar es salaam")) {
    return "Tanzania";
  }
  return "Remote";
}

export interface IngestionStats {
  source: string;
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  error?: string;
}

interface PreparedJob {
  externalId: string;
  title: string;
  description: string;
  country: string;
  city: string;
  workMode: string;
  seniority: string;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  applyUrl: string;
  applicationMethod: string;
  platform: string;
  postedAt: Date;
  companySlug: string;
  companyName: string;
  companyWebsite: string | null;
  skills: string[];
  simhash: string;
  fingerprint: string;
}

function prepareJob(job: RawJob): PreparedJob {
  const postedAt = job.postedAt ? new Date(job.postedAt) : new Date();
  const description = job.description.slice(0, 8000) || job.title;
  const city = (job.location ?? "").slice(0, 120);
  const parsedPostedAt = job.postedAt ? new Date(job.postedAt) : new Date();
  const safePostedAt = Number.isNaN(parsedPostedAt.getTime())
    ? new Date()
    : parsedPostedAt;

  return {
    externalId: job.externalId,
    title: job.title.slice(0, 200),
    description,
    country: detectCountry(job),
    city,
    workMode: detectWorkMode(job),
    seniority: detectSeniority(job),
    employmentType: (job.employmentType ?? "full_time").slice(0, 40),
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    currency: job.currency ?? null,
    applyUrl: job.applyUrl,
    applicationMethod: job.applyUrl.includes("mailto:") ? "email" : "website",
    platform: job.platform,
    postedAt: safePostedAt,
    simhash: simhash(`${job.company} ${job.title} ${description}`).toString(),
    fingerprint: fingerprintInput({
      company: job.company,
      title: job.title,
      city,
      postedAt: safePostedAt,
    }),
    companySlug: slugify(job.company) || "unknown",
    companyName: job.company,
    companyWebsite: job.companyWebsite ?? null,
    skills: extractSkills(job),
  };
}

async function upsertSource(adapter: JobSourceAdapter): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO job_sources (type, name, url, external_id, health, last_checked_at)
     VALUES ($1, $2, $3, $4, 'healthy', now())
     ON CONFLICT (type, url, external_id)
     DO UPDATE SET health = 'healthy', last_checked_at = now()
     RETURNING id`,
    [adapter.type, adapter.name, adapter.url, adapter.name.toLowerCase()],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("SOURCE_UPSERT_FAILED");
  return id;
}

const RISK_CONCURRENCY = Number(process.env.RISK_SCORING_CONCURRENCY ?? 8);

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function hostnameOfUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Loads the per-batch signals the risk engine needs with two queries instead
 * of two per job. With Neon at ~200ms round trip this is the difference
 * between a one minute ingest and a nine minute ingest.
 */
async function loadBatchRiskFeatures(
  prepared: PreparedJob[],
): Promise<Map<string, PrecomputedRiskFeatures>> {
  const map = new Map<string, PrecomputedRiskFeatures>();

  const slugs = [
    ...new Set(
      prepared.map((job) => job.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
    ),
  ];
  const hostnames = [
    ...new Set(
      prepared
        .map((job) => hostnameOfUrl(job.applyUrl))
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const knownSlugs = new Set<string>();
  if (slugs.length > 0) {
    const companies = await query<{ slug: string }>(
      `SELECT slug FROM companies WHERE slug = ANY($1::text[])`,
      [slugs],
    );
    for (const row of companies.rows) knownSlugs.add(row.slug);
  }

  const certAgeByHostname = new Map<string, number | null>();
  {
    const uniqueHosts = [
      ...new Set(
        prepared
          .map((job) => hostnameOfUrl(job.applyUrl))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    await mapWithConcurrency(uniqueHosts, 8, async (host) => {
      certAgeByHostname.set(host, await certificateAgeForHost(host));
    });
  }

  const bulkByHostname = new Map<string, number>();
  if (hostnames.length > 0) {
    const bulk = await query<{ hostname: string; count: string }>(
      `SELECT substring(apply_url from 'https?://([^/]+)') AS hostname,
              count(*)::text AS count
         FROM opportunities
        WHERE created_at > now() - interval '24 hours'
        GROUP BY 1`,
    );
    for (const row of bulk.rows) {
      const hostname = row.hostname.replace(/^www\./, "").toLowerCase();
      bulkByHostname.set(hostname, Number(row.count));
    }
  }

  for (const job of prepared) {
    const slug = job.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const hostname = hostnameOfUrl(job.applyUrl);
    map.set(job.externalId, {
      companyKnown: knownSlugs.has(slug),
      bulkPostingCount: hostname ? (bulkByHostname.get(hostname) ?? 0) : 0,
      domainAgeDays: hostname ? (certAgeByHostname.get(hostname) ?? null) : null,
    });
  }

  return map;
}

async function upsertBatch(
  prepared: PreparedJob[],
  sourceId: string,
): Promise<{ inserted: number; updated: number }> {
  if (prepared.length === 0) return { inserted: 0, updated: 0 };

  const precomputed = await loadBatchRiskFeatures(prepared);
  const scored = new Map<string, RiskAssessment>();

  await mapWithConcurrency(prepared, RISK_CONCURRENCY, async (job) => {
    const assessment = await assessRisk({
      title: job.title,
      description: job.description,
      company: job.companyName,
      applyUrl: job.applyUrl,
      country: job.country,
      seniority: job.seniority,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      currency: job.currency ?? null,
      precomputed: precomputed.get(job.externalId),
    }).catch((error) => {
      console.error(
        "[risk] scoring failed",
        error instanceof Error
          ? `${error.name}: ${error.message} ${error.stack?.split("\n")[1] ?? ""}`
          : String(error),
      );
      return {
        score: 0,
        action: "publish" as RiskAction,
        flags: [] as string[],
        features: {} as RiskFeatures,
      };
    });
    scored.set(job.externalId, assessment);
  });

  const companyNames = prepared.map((job) => job.companyName);
  const companySlugs = prepared.map((job) => job.companySlug);
  const companyCountries = prepared.map((job) => job.country);
  const companyWebsites = prepared.map((job) => job.companyWebsite);

  await query(
    `INSERT INTO companies (name, slug, country, website)
     SELECT DISTINCT ON (slug) name, slug, country, website
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
            AS t(name, slug, country, website)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           website = COALESCE(EXCLUDED.website, companies.website)`,
    [companyNames, companySlugs, companyCountries, companyWebsites],
  );

  const result = await query<{ id: string; external_id: string; inserted: boolean }>(
    `INSERT INTO opportunities (
       company_id, source_id, external_id, title, description, country, city,
       work_mode, seniority, employment_type, salary_min, salary_max, currency,
       apply_url, application_method, platform, posted_at, status,
       risk_score, risk_flags, risk_action, risk_scored_at, simhash, fingerprint
     )
     SELECT c.id, $1::uuid, x.external_id, x.title, x.description, x.country,
            x.city, x.work_mode, x.seniority, x.employment_type, x.salary_min,
            x.salary_max, x.currency, x.apply_url, x.application_method,
            x.platform, x.posted_at,
            CASE WHEN x.risk_action = 'reject' THEN 'hidden' ELSE 'active' END,
            x.risk_score, '{}'::text[], x.risk_action, now(), x.simhash::bigint,
            x.fingerprint
       FROM unnest(
              $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
              $7::text[], $8::text[], $9::text[], $10::text[],
              $11::int[], $12::int[], $13::text[], $14::text[], $15::text[],
              $16::text[], $17::timestamptz[], $18::text[], $19::numeric[],
              $20::text[], $21::bigint[], $22::text[]
            ) AS x(
              company_slug, external_id, title, description, country, city,
              work_mode, seniority, employment_type, salary_min, salary_max,
              currency, apply_url, application_method, platform, posted_at,
              company_name, risk_score, risk_action, simhash, fingerprint
            )
       JOIN companies c ON c.slug = x.company_slug
     ON CONFLICT (source_id, external_id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       country = EXCLUDED.country,
       city = EXCLUDED.city,
       work_mode = EXCLUDED.work_mode,
       seniority = EXCLUDED.seniority,
       employment_type = EXCLUDED.employment_type,
       salary_min = EXCLUDED.salary_min,
       salary_max = EXCLUDED.salary_max,
       currency = EXCLUDED.currency,
       apply_url = EXCLUDED.apply_url,
       platform = EXCLUDED.platform,
       posted_at = EXCLUDED.posted_at,
       risk_score = EXCLUDED.risk_score,
       risk_flags = EXCLUDED.risk_flags,
       risk_action = EXCLUDED.risk_action,
       risk_scored_at = now(),
       simhash = EXCLUDED.simhash,
       fingerprint = EXCLUDED.fingerprint,
       status = CASE WHEN EXCLUDED.risk_action = 'reject' THEN 'hidden' ELSE 'active' END
     RETURNING id, external_id, (xmax = 0) AS inserted`,
    [
      sourceId,
      prepared.map((job) => job.companySlug),
      prepared.map((job) => job.externalId),
      prepared.map((job) => job.title),
      prepared.map((job) => job.description),
      prepared.map((job) => job.country),
      prepared.map((job) => job.city),
      prepared.map((job) => job.workMode),
      prepared.map((job) => job.seniority),
      prepared.map((job) => job.employmentType),
      prepared.map((job) => job.salaryMin),
      prepared.map((job) => job.salaryMax),
      prepared.map((job) => job.currency),
      prepared.map((job) => job.applyUrl),
      prepared.map((job) => job.applicationMethod),
      prepared.map((job) => job.platform),
      prepared.map((job) => job.postedAt),
      prepared.map((job) => job.companyName),
      prepared.map((job) => scored.get(job.externalId)?.score ?? 0),
      prepared.map((job) => scored.get(job.externalId)?.action ?? "publish"),
      prepared.map((job) => job.simhash),
      prepared.map((job) => job.fingerprint),
    ],
  );

  // risk_flags is a per-row array and cannot travel through unnest(), so the
  // flags are written in one follow-up statement.
  const flagged = prepared.filter(
    (job) => (scored.get(job.externalId)?.flags.length ?? 0) > 0,
  );
  if (flagged.length > 0) {
    await query(
      `UPDATE opportunities o
          SET risk_flags = ARRAY(SELECT jsonb_array_elements_text(x.flags)),
              risk_score = x.score,
              risk_action = x.action,
              risk_scored_at = now()
         FROM unnest($1::text[], $2::int[], $3::text[], $4::jsonb[])
              AS x(external_id, score, action, flags)
        WHERE o.source_id = $5::uuid
          AND o.external_id = x.external_id`,
      [
        flagged.map((job) => job.externalId),
        flagged.map((job) => scored.get(job.externalId)?.score ?? 0),
        flagged.map((job) => scored.get(job.externalId)?.action ?? "publish"),
        flagged.map((job) =>
          JSON.stringify(scored.get(job.externalId)?.flags ?? []),
        ),
        sourceId,
      ],
    );
  }

  const opportunityIds = result.rows.map((row) => row.id);
  const idByExternalId = new Map(
    result.rows.map((row) => [row.external_id, row.id]),
  );

  const skillPairs: string[] = [];
  const skillOpportunityIds: string[] = [];
  for (const job of prepared) {
    const opportunityId = idByExternalId.get(job.externalId);
    if (!opportunityId) continue;
    for (const skill of job.skills) {
      skillOpportunityIds.push(opportunityId);
      skillPairs.push(skill);
    }
  }

  if (skillOpportunityIds.length > 0) {
    await query(
      `INSERT INTO opportunity_skills (opportunity_id, skill)
       SELECT os.opportunity_id, os.skill
         FROM unnest($1::uuid[], $2::text[]) AS os(opportunity_id, skill)
       ON CONFLICT (opportunity_id, skill) DO NOTHING`,
      [skillOpportunityIds, skillPairs],
    );
  }

  const inserted = result.rows.filter((row) => row.inserted).length;
  return { inserted, updated: result.rows.length - inserted };
}

export async function ingestSource(
  adapter: JobSourceAdapter,
): Promise<IngestionStats> {
  const stats: IngestionStats = {
    source: adapter.name,
    fetched: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
  };

  let sourceId: string;
  try {
    sourceId = await upsertSource(adapter);
  } catch (error) {
    stats.error = error instanceof Error ? error.message : "SOURCE_UPSERT_FAILED";
    return stats;
  }

  let jobs: RawJob[];
  try {
    jobs = await adapter.fetchJobs();
    stats.fetched = jobs.length;
  } catch (error) {
    stats.error = error instanceof Error ? error.message : "FETCH_FAILED";
    await query(
      `UPDATE job_sources SET health = 'error', last_checked_at = now() WHERE id = $1`,
      [sourceId],
    );
    return stats;
  }

  const prepared = jobs.map(prepareJob);
  const deduped = new Map<string, PreparedJob>();
  for (const job of prepared) {
    deduped.set(job.externalId, job);
  }
  const unique = [...deduped.values()];
  const batchSize = 50;

  for (let index = 0; index < unique.length; index += batchSize) {
    const batch = unique.slice(index, index + batchSize);
    try {
      const outcome = await upsertBatch(batch, sourceId);
      stats.inserted += outcome.inserted;
      stats.updated += outcome.updated;
    } catch (error) {
      console.error(
        `[ingest] ${adapter.name} batch failed`,
        error instanceof Error ? error.message : error,
      );
      stats.failed += batch.length;
    }
  }

  return stats;
}
