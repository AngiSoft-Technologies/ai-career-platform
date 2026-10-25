import { query } from "../db/pool.js";

export interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  careersUrl: string | null;
  industry: string | null;
  country: string | null;
  openRoles: number;
  newThisWeek: number;
}

export interface ProfessionSummary {
  id: string;
  slug: string;
  name: string;
  depth: number;
  domain: string | null;
  aliases: string[];
  medianSalary: number | null;
  currency: string | null;
}

export async function listCompanies(input: {
  q?: string;
  limit?: number;
}): Promise<CompanySummary[]> {
  const result = await query<{
    id: string;
    name: string;
    slug: string;
    website: string | null;
    careers_url: string | null;
    industry: string | null;
    country: string | null;
    open_roles: number;
    new_this_week: number;
  }>(
    `SELECT c.id, c.name, c.slug, c.website, c.careers_url, c.industry, c.country,
            count(o.id)::int AS open_roles,
            count(o.id) FILTER (WHERE o.posted_at > now() - interval '7 days')::int AS new_this_week
       FROM companies c
       LEFT JOIN opportunities o ON o.company_id = c.id AND o.status = 'active'
      WHERE ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%')
      GROUP BY c.id
      ORDER BY open_roles DESC, c.name ASC
      LIMIT $2`,
    [input.q ?? null, Math.min(input.limit ?? 50, 100)],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    website: row.website,
    careersUrl: row.careers_url,
    industry: row.industry,
    country: row.country,
    openRoles: row.open_roles,
    newThisWeek: row.new_this_week,
  }));
}

export async function getCompanyBySlug(slug: string): Promise<CompanySummary | null> {
  const companies = await listCompanies({ q: undefined, limit: 1000 });
  return companies.find((company) => company.slug === slug) ?? null;
}

export async function listProfessions(depth?: number): Promise<ProfessionSummary[]> {
  const result = await query<{
    id: string;
    slug: string;
    name: string;
    depth: number;
    domain: string | null;
    aliases: string[] | null;
    median_salary: number | null;
    currency: string | null;
  }>(
    `SELECT id, slug, name, depth, domain, aliases, median_salary, currency
       FROM profession_taxonomy
      WHERE is_active = true
        AND ($1::int IS NULL OR depth = $1)
      ORDER BY depth, name
      LIMIT 500`,
    [depth ?? null],
  );

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    depth: row.depth,
    domain: row.domain,
    aliases: row.aliases ?? [],
    medianSalary: row.median_salary,
    currency: row.currency,
  }));
}
