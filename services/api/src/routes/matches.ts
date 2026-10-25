import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { rankedOpportunities, calculateMatch } from "../services/matching.js";

export const matchesRouter = Router();

matchesRouter.get("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const query_ = z
      .object({
        q: z.string().max(200).optional(),
        country: z.string().max(80).optional(),
        workMode: z.string().max(40).optional(),
        seniority: z.string().max(40).optional(),
        semantic: z.enum(["true", "false"]).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(request.query);

    const items = await rankedOpportunities(userId, {
      q: query_.q,
      country: query_.country,
      workMode: query_.workMode,
      seniority: query_.seniority,
      semantic: query_.semantic === "true",
      limit: query_.limit,
    });

    response.json({ items, total: items.length });
  } catch (error) {
    next(error);
  }
});

matchesRouter.get("/:opportunityId", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const opportunityId = z.string().uuid().parse(request.params.opportunityId);
    const match = await calculateMatch(userId, opportunityId);
    response.json({ match });
  } catch (error) {
    next(error);
  }
});

matchesRouter.post("/:opportunityId", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const opportunityId = z.string().uuid().parse(request.params.opportunityId);
    const match = await calculateMatch(userId, opportunityId);
    response.json({ match });
  } catch (error) {
    next(error);
  }
});

export const companiesRouter = Router();

companiesRouter.get("/", async (request, response, next) => {
  try {
    const query_ = z
      .object({
        q: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    const result = await query(
      `SELECT c.id, c.name, c.slug, c.website, c.careers_url, c.industry, c.country,
              count(o.id)::int AS open_roles,
              count(o.id) FILTER (WHERE o.posted_at > now() - interval '7 days')::int AS new_this_week
         FROM companies c
         LEFT JOIN opportunities o ON o.company_id = c.id AND o.status = 'active'
        WHERE ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%')
        GROUP BY c.id
        ORDER BY open_roles DESC, c.name ASC
        LIMIT $2`,
      [query_.q ?? null, query_.limit],
    );

    response.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

companiesRouter.get("/:slug", async (request, response, next) => {
  try {
    const slug = z.string().min(2).max(160).parse(request.params.slug);
    const company = await query(
      `SELECT id, name, slug, website, careers_url, industry, country, created_at, updated_at
         FROM companies WHERE slug = $1`,
      [slug],
    );
    const row = company.rows[0];
    if (!row) {
      response.status(404).json({ error: "Company not found" });
      return;
    }

    const roles = await query(
      `SELECT id, title, country, city, work_mode, seniority, employment_type,
              salary_min, salary_max, currency, apply_url, posted_at, status
         FROM opportunities
        WHERE company_id = $1 AND status = 'active'
        ORDER BY posted_at DESC LIMIT 50`,
      [row.id],
    );

    const stats = await query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE posted_at > now() - interval '7 days')::int AS last_7_days,
              count(*) FILTER (WHERE posted_at > now() - interval '30 days')::int AS last_30_days,
              avg(COALESCE(salary_min, salary_max))::int AS avg_salary,
              count(DISTINCT country)::int AS countries
         FROM opportunities WHERE company_id = $1`,
      [row.id],
    );

    response.json({ company: row, roles: roles.rows, stats: stats.rows[0] });
  } catch (error) {
    next(error);
  }
});
