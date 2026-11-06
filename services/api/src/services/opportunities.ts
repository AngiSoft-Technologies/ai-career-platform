import type { Eligibility, Opportunity } from "@angisoft/mboqara-contracts";
import { query } from "../db/pool.js";

export interface OpportunityFilters {
  country?: string;
  q?: string;
  workMode?: string;
  employmentType?: string;
  seniority?: string;
  eligibility?: Eligibility;
  limit?: number;
}

interface OpportunityRow {
  id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  company_website: string | null;
  title: string;
  description: string;
  country: string;
  city: string;
  work_mode: string;
  seniority: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  apply_url: string;
  application_method: string;
  platform: string;
  posted_at: Date;
  expires_at: Date | null;
  status: string;
  skills: string[];
  eligibility: string | null;
  eligibility_reasons: unknown;
  /** Postgres returns `numeric` as a string; the mapper coerces it. */
  risk_score: number | string | null;
  risk_action: string | null;
  risk_flags: unknown;
}

/**
 * Where the employer publishes a role, in words.
 *
 * `platform` carries the board's own address — "workday:alliancewd",
 * "oracle:fa-eqnk…|CX_3001", "greenhouse:jumia" — which is the answer
 * to "where does this company post", and is not something to show a
 * candidate. The vendor's name is.
 */
function sourceKindOf(platform: string): string {
  const vendor = platform.split(":")[0] ?? platform;
  switch (vendor) {
    case "workday":
      return "Workday board";
    case "oracle":
      return "Oracle HCM careers site";
    case "greenhouse":
      return "Greenhouse board";
    case "lever":
      return "Lever board";
    case "ashby":
      return "Ashby board";
    case "taleo":
      return "Taleo careers section";
    case "breezy":
      return "Breezy board";
    case "workable":
      return "Workable board";
    case "smartrecruiters":
      return "SmartRecruiters site";
    case "recruitee":
      return "Recruitee site";
    case "careers_page":
      return "Employer's careers page";
    case "listing_link":
      return "Job listing page";
    case "custom":
      return "Employer's own site";
    default:
      return vendor ? `${vendor} listing` : "Employer's own site";
  }
}

function mapOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    companySlug: row.company_slug,
    companyWebsite: row.company_website ?? undefined,
    title: row.title,
    description: row.description,
    country: row.country,
    city: row.city,
    workMode: row.work_mode as Opportunity["workMode"],
    seniority: row.seniority as Opportunity["seniority"],
    employmentType: row.employment_type,
    salaryMin: row.salary_min ?? undefined,
    salaryMax: row.salary_max ?? undefined,
    currency: row.currency ?? undefined,
    applyUrl: row.apply_url,
    applicationMethod:
      row.application_method as Opportunity["applicationMethod"],
    platform: row.platform,
    sourceKind: sourceKindOf(row.platform),
    postedAt: row.posted_at.toISOString(),
    expiresAt: row.expires_at?.toISOString(),
    status: row.status,
    skills: row.skills,
    eligibility: (row.eligibility ?? undefined) as Opportunity["eligibility"],
    eligibilityReasons: Array.isArray(row.eligibility_reasons)
      ? (row.eligibility_reasons.filter(
          (reason): reason is string => typeof reason === "string",
        ) as string[])
      : undefined,
    // `numeric` comes back from Postgres as a string, and a score that
    // arrives as "54.00" is a score a client has to coerce.
    riskScore:
      row.risk_score === null || row.risk_score === undefined
        ? undefined
        : Number(row.risk_score),
    riskAction: row.risk_action ?? undefined,
    riskFlags: Array.isArray(row.risk_flags)
      ? (row.risk_flags.filter(
          (flag): flag is string => typeof flag === "string",
        ) as string[])
      : undefined,
  };
}

const baseSelect = `
  SELECT o.id, o.company_id, c.name AS company_name, c.slug AS company_slug,
    c.website AS company_website, o.title, o.description, o.country, o.city,
    o.work_mode, o.seniority, o.employment_type, o.salary_min, o.salary_max,
    o.currency, o.apply_url, o.application_method, o.platform, o.posted_at,
    o.expires_at, o.status, o.eligibility, o.eligibility_reasons,
    o.risk_score, o.risk_action, o.risk_flags,
    COALESCE(array_agg(os.skill ORDER BY os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
  FROM opportunities o
  JOIN companies c ON c.id = o.company_id
  LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
`;

export async function listOpportunities(
  filters: OpportunityFilters,
): Promise<Opportunity[]> {
  // A posting the trust engine held is not a posting a candidate sees.
  //
  // The engine scores every posting and writes what it decided — 359 of
  // them are held right now — but nothing read the decision back, so the
  // held postings sat in the feed anyway and the whole judgement was
  // decoration. The detail view is deliberately left open: a reviewer
  // has to be able to open the row they are deciding about.
  const clauses = [
    "o.status = 'active'",
    "COALESCE(o.risk_action, 'publish') <> 'hold'",
  ];
  const values: unknown[] = [];

  if (filters.country) {
    values.push(`%${filters.country}%`);
    clauses.push(`o.country ILIKE $${values.length}`);
  }
  if (filters.q) {
    values.push(filters.q);
    clauses.push(
      `(o.search_vector @@ plainto_tsquery('english', $${values.length})
        OR o.title ILIKE '%' || $${values.length} || '%'
        OR c.name ILIKE '%' || $${values.length} || '%')`,
    );
  }
  if (filters.workMode) {
    values.push(filters.workMode);
    clauses.push(`o.work_mode = $${values.length}`);
  }
  if (filters.seniority) {
    values.push(filters.seniority);
    clauses.push(`o.seniority = $${values.length}`);
  }
  if (filters.employmentType) {
    values.push(filters.employmentType);
    clauses.push(`o.employment_type = $${values.length}`);
  }
  if (filters.eligibility) {
    values.push(filters.eligibility);
    clauses.push(`o.eligibility = $${values.length}`);
  }

  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  values.push(limit);

  const result = await query<OpportunityRow>(
    `${baseSelect}
     WHERE ${clauses.join(" AND ")}
     GROUP BY o.id, c.id
     ORDER BY o.posted_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows.map(mapOpportunity);
}

/**
 * The postings the trust engine is holding.
 *
 * A held posting is not in the feed — that is the decision being honoured
 * — so the queue that reviews them has to be able to ask for them
 * directly. Newest judgement first: a posting scored an hour ago is the
 * one worth looking at.
 *
 * The route in front of this is permission-gated; the function is not,
 * because it is a query, not a decision about who may ask.
 */
export async function listHeldOpportunities(
  filters: OpportunityFilters,
): Promise<Opportunity[]> {
  const clauses = ["o.status = 'active'", "o.risk_action = 'hold'"];
  const values: unknown[] = [];

  if (filters.country) {
    values.push(`%${filters.country}%`);
    clauses.push(`o.country ILIKE $${values.length}`);
  }
  if (filters.q) {
    values.push(filters.q);
    clauses.push(
      `(o.search_vector @@ plainto_tsquery('english', $${values.length})
        OR o.title ILIKE '%' || $${values.length} || '%'
        OR c.name ILIKE '%' || $${values.length} || '%')`,
    );
  }

  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  values.push(limit);

  const result = await query<OpportunityRow>(
    `${baseSelect}
     WHERE ${clauses.join(" AND ")}
     GROUP BY o.id, c.id
     ORDER BY o.risk_scored_at DESC NULLS LAST, o.posted_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows.map(mapOpportunity);
}

export async function getOpportunity(
  id: string,
): Promise<Opportunity | null> {
  const result = await query<OpportunityRow>(
    `${baseSelect}
     WHERE o.id = $1
     GROUP BY o.id, c.id`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapOpportunity(row) : null;
}
