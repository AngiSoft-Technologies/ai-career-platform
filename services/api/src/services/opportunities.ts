import type { Opportunity } from "@angisoft/job-radar-contracts";
import { query } from "../db/pool.js";

export interface OpportunityFilters {
  country?: string;
  q?: string;
  workMode?: string;
  seniority?: string;
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
    postedAt: row.posted_at.toISOString(),
    expiresAt: row.expires_at?.toISOString(),
    status: row.status,
    skills: row.skills,
  };
}

const baseSelect = `
  SELECT o.id, o.company_id, c.name AS company_name, c.slug AS company_slug,
    c.website AS company_website, o.title, o.description, o.country, o.city,
    o.work_mode, o.seniority, o.employment_type, o.salary_min, o.salary_max,
    o.currency, o.apply_url, o.application_method, o.platform, o.posted_at,
    o.expires_at, o.status,
    COALESCE(array_agg(os.skill ORDER BY os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
  FROM opportunities o
  JOIN companies c ON c.id = o.company_id
  LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
`;

export async function listOpportunities(
  filters: OpportunityFilters,
): Promise<Opportunity[]> {
  const clauses = ["o.status = 'active'"];
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
