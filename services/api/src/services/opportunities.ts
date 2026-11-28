import type { Eligibility, Opportunity } from "@angisoft/mboqara-contracts";
import { query } from "../db/pool.js";
import {
  canonicalEmploymentType,
  canonicalEmploymentTypeSql,
} from "./employment.js";

export interface OpportunityFilters {
  country?: string;
  q?: string;
  workMode?: string;
  employmentType?: string;
  seniority?: string;
  /** Profession taxonomy slug; descendants of that profession count too. */
  profession?: string;
  eligibility?: Eligibility;
  /** Earliest `posted_at` to include (ISO timestamp), used by the daily feed. */
  postedSince?: string;
  /**
   * Minimum computed match score. Applied after ranking, never in the shared
   * feed clauses: `score` is derived, not a column on `opportunities`.
   */
  minScore?: number;
  limit?: number;
  /** How many rows to skip. Pagination for a catalogue of a thousand roles. */
  offset?: number;
}

export interface OpportunityRow {
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
    case "listing":
      return "Job listing page";
    case "duckduckgo":
    case "bing":
    case "searxng":
      return "Web search listing";
    case "web":
      return "Employer's website";
    case "custom":
      return "Employer's own site";
    default:
      return vendor ? `${vendor} listing` : "Employer's own site";
  }
}

export function mapOpportunity(row: OpportunityRow): Opportunity {
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
    // Boards spell an arrangement a dozen ways. A candidate sees the
    // product's own word; the raw value stays in the database.
    employmentType: canonicalEmploymentType(row.employment_type),
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

/** The catalogue columns, with the FROM clause supplied by the caller. */
export function opportunitySelectFrom(fromClause: string): string {
  return `
  SELECT o.id, o.company_id, c.name AS company_name, c.slug AS company_slug,
    c.website AS company_website, o.title, o.description, o.country, o.city,
    o.work_mode, o.seniority, o.employment_type, o.salary_min, o.salary_max,
    o.currency, o.apply_url, o.application_method, o.platform, o.posted_at,
    o.expires_at, o.status, o.eligibility, o.eligibility_reasons,
    o.risk_score, o.risk_action, o.risk_flags,
    COALESCE(array_agg(os.skill ORDER BY os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
  ${fromClause}
`;
}

export const opportunitySelect = opportunitySelectFrom(`
  FROM opportunities o
  JOIN companies c ON c.id = o.company_id
  LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
`);

/**
 * The WHERE clause for the feed, shared by the list and the count.
 *
 * The count has to agree with the list — a pager that says "1,284 roles"
 * and then stops at row 40 is worse than no pager — so both are built from
 * one set of clauses rather than two that can drift.
 */
export function opportunityFeedClauses(filters: OpportunityFilters): {
  clauses: string[];
  values: unknown[];
} {
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
    clauses.push(
      `${canonicalEmploymentTypeSql("o.employment_type")} = $${values.length}`,
    );
  }
  if (filters.eligibility) {
    values.push(filters.eligibility);
    clauses.push(`o.eligibility = $${values.length}`);
  }
  if (filters.profession) {
    // EXISTS keeps this a filter rather than another row source: joining the
    // taxonomy directly would duplicate an opportunity tagged with both a
    // parent and a child profession, and the count would drift from the list.
    values.push(filters.profession);
    clauses.push(`EXISTS (
      SELECT 1
        FROM opportunity_professions op
        JOIN profession_taxonomy pt ON pt.id = op.profession_id
       WHERE op.opportunity_id = o.id
         AND (
           pt.slug = $${values.length}
           OR EXISTS (
             SELECT 1
               FROM profession_closure pc
               JOIN profession_taxonomy child ON child.id = pc.descendant
              WHERE pc.ancestor = pt.id
                AND child.slug = $${values.length}
           )
         )
    )`);
  }
  if (filters.postedSince) {
    values.push(filters.postedSince);
    clauses.push(`o.posted_at >= $${values.length}::timestamptz`);
  }

  // `minScore` is intentionally absent: the score is computed later by the
  // ranking query, so putting it here would either be invalid SQL or make
  // the unranked list/count disagree with what the feed can actually show.

  return { clauses, values };
}

/**
 * How many roles match the filters.
 *
 * This is what the pager counts, and it is a separate statement because
 * `count(*)` over a grouped feed is a different plan from the feed's own
 * query.
 */
export async function countOpportunities(
  filters: OpportunityFilters,
): Promise<number> {
  const { clauses, values } = opportunityFeedClauses(filters);
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM opportunities o
       JOIN companies c ON c.id = o.company_id
      WHERE ${clauses.join(" AND ")}`,
    values,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function listOpportunities(
  filters: OpportunityFilters,
): Promise<Opportunity[]> {
  const { clauses, values } = opportunityFeedClauses(filters);

  // The feed is a page, not a window: the count and the rows ask the same
  // question, so a caller can page through the whole catalogue.
  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  values.push(limit);
  const offset = Math.max(filters.offset ?? 0, 0);
  values.push(offset);

  const result = await query<OpportunityRow>(
    `${opportunitySelect}
     WHERE ${clauses.join(" AND ")}
     GROUP BY o.id, c.id
     ORDER BY o.posted_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
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
    `${opportunitySelect}
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
    `${opportunitySelect}
     WHERE o.id = $1
     GROUP BY o.id, c.id`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapOpportunity(row) : null;
}

/**
 * The safe, public view of one live role.
 *
 * This is what anonymous visitors and mobile clients can read before they
 * create an account. It deliberately leaves out the source `applyUrl` and the
 * raw `platform` identifier: Apply stays an intentional, authenticated action,
 * and the platform string is an internal board address rather than candidate
 * information.
 */
export interface PublicOpportunity {
  id: string;
  title: string;
  company: string;
  companySlug: string;
  description: string;
  country: string;
  city: string;
  workMode: string;
  seniority: string;
  employmentType: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  applicationMethod: string;
  sourceKind: string;
  postedAt: string;
  expiresAt?: string;
  skills: string[];
  eligibility?: string;
  eligibilityReasons: string[];
  riskScore?: number;
  riskAction?: string;
}

function toPublicOpportunity(item: Opportunity): PublicOpportunity {
  return {
    id: item.id,
    title: item.title,
    company: item.companyName,
    companySlug: item.companySlug,
    description: item.description,
    country: item.country,
    city: item.city,
    workMode: item.workMode,
    seniority: item.seniority,
    employmentType: item.employmentType,
    salaryMin: item.salaryMin,
    salaryMax: item.salaryMax,
    currency: item.currency,
    applicationMethod: item.applicationMethod,
    sourceKind: item.sourceKind ?? "Job listing",
    postedAt: item.postedAt,
    expiresAt: item.expiresAt,
    skills: item.skills ?? [],
    eligibility: item.eligibility,
    eligibilityReasons: item.eligibilityReasons ?? [],
    riskScore: item.riskScore,
    riskAction: item.riskAction,
  };
}

export async function getPublicOpportunity(
  id: string,
): Promise<PublicOpportunity | null> {
  if (!id || id.length > 128) return null;

  const result = await query<OpportunityRow>(
    `${opportunitySelect}
     WHERE o.id = $1
       AND o.status = 'active'
       AND (o.expires_at IS NULL OR o.expires_at > now())
       AND COALESCE(o.risk_action, 'publish') <> 'hold'
     GROUP BY o.id, c.id`,
    [id],
  );
  const row = result.rows[0];
  return row ? toPublicOpportunity(mapOpportunity(row)) : null;
}

/** Public catalogue for the marketing pages and mobile clients. */
export async function listPublicOpportunities(
  limit = 24,
): Promise<PublicOpportunity[]> {
  const bounded = Math.min(Math.max(limit, 1), 100);
  const items = await listOpportunities({ limit: bounded, offset: 0 });
  return items.map(toPublicOpportunity);
}
