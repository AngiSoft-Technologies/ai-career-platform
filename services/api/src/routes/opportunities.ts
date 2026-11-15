import { Router } from "express";
import { z } from "zod";
import { cacheGet, cacheSet } from "../db/redis.js";
import { query } from "../db/pool.js";
import { ensureBlueprint } from "../services/applications.js";
import { requirePermission } from "../middleware/rbac.js";
import { canonicalEmploymentTypeSql } from "../services/employment.js";
import {
  getOpportunityWithMatch,
  rankedOpportunities,
} from "../services/matching.js";
import {
  countOpportunities,
  listHeldOpportunities,
  listOpportunities,
} from "../services/opportunities.js";

const searchSchema = z.object({
  country: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
  employmentType: z
    .enum([
      "full_time",
      "part_time",
      "contract",
      "internship",
      "trainee",
      "industrial_attachment",
      "freelance",
    ])
    .optional(),
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead"]).optional(),
  // "Can I hold this role" — answered from what the posting says about
  // location and work authorisation. A candidate filtering on this is
  // not asking for a wider net; they are asking for the roles that are
  // open to them.
  eligibility: z
    .enum(["eligible", "unlikely", "ineligible", "unknown"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // Where the page starts. The catalogue holds more than a thousand roles,
  // so the feed has to be paged rather than truncated.
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
  semantic: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  ranked: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
});

const heldSchema = z.object({
  country: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const opportunitiesRouter = Router();

/**
 * The postings the trust engine is holding, for the queue that reviews
 * them.
 *
 * The feed no longer carries a held posting — the engine's decision is
 * finally honoured — so the review queue asks for them directly, and
 * only someone who is allowed to act on the queue may ask.
 */
opportunitiesRouter.get(
  "/held",
  requirePermission("moderation:queue"),
  async (request, response, next) => {
    try {
      const filters = heldSchema.parse(request.query);
      const items = await listHeldOpportunities(filters);
      response.json({ items, cached: false });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * The values the feed can be filtered by.
 *
 * The filter bar used to build its country list from the roles that
 * happened to be on the page, which meant the filter offered a country
 * only if the current page happened to contain one — and a candidate
 * filtering by a country could not filter by a country whose roles were
 * all on page nine.
 *
 * These are the counts for the whole catalogue, so the bar is the same
 * whatever page is open.
 */
interface FacetsResponse {
  countries: Array<{ country: string; count: number }>;
  workModes: Array<{ workMode: string; count: number }>;
  seniorities: Array<{ seniority: string; count: number }>;
  employmentTypes: Array<{ employmentType: string; count: number }>;
}

opportunitiesRouter.get("/facets", async (_request, response, next) => {
  try {
    const cached = await cacheGet<FacetsResponse>("opportunities:facets");
    if (cached) {
      response.json(cached);
      return;
    }

    // One scan answers every facet. A facet is a property of the
    // catalogue, not of the page a person happens to be looking at, so
    // "United States" appears whether it has a role on page one or only on
    // page nine.
    const employmentTypes = [
      "full_time",
      "part_time",
      "contract",
      "internship",
      "trainee",
      "industrial_attachment",
      "freelance",
    ];

    const result = await query<{
      dimension: string;
      value: string;
      count: string;
    }>(
      `WITH counts AS (
         SELECT f.dimension, f.value
           FROM opportunities o
           CROSS JOIN LATERAL (
             VALUES
               ('country', o.country),
               ('workMode', lower(o.work_mode)),
               ('seniority', lower(o.seniority)),
               ('employmentType', ${canonicalEmploymentTypeSql("o.employment_type")})
           ) AS f(dimension, value)
          WHERE o.status = 'active'
            AND COALESCE(o.risk_action, 'publish') <> 'hold'
       )
       SELECT dimension, value, count(*)::text AS count
         FROM counts
        WHERE NOT (dimension = 'employmentType'
                   AND value <> ALL($1::text[]))
           AND NOT (dimension = 'workMode'
                   AND value <> ALL(ARRAY['onsite', 'hybrid', 'remote']))
        GROUP BY dimension, value
        ORDER BY count(*) DESC, value ASC`,
      [employmentTypes],
    );

    const payload: FacetsResponse = {
      countries: [],
      workModes: [],
      seniorities: [],
      employmentTypes: [],
    };

    for (const row of result.rows) {
      const count = Number(row.count);
      if (row.dimension === "country") {
        payload.countries.push({ country: row.value, count });
      } else if (row.dimension === "workMode") {
        payload.workModes.push({ workMode: row.value, count });
      } else if (row.dimension === "seniority") {
        payload.seniorities.push({ seniority: row.value, count });
      } else if (row.dimension === "employmentType") {
        payload.employmentTypes.push({ employmentType: row.value, count });
      }
    }

    await cacheSet("opportunities:facets", payload, 300);
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

opportunitiesRouter.get("/", async (request, response) => {
  const userId = response.locals.userId as string;
  const filters = searchSchema.parse(request.query);
  const ranked = filters.ranked ?? true;
  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const cacheKey = `opportunities:${userId}:${ranked}:${JSON.stringify(filters)}`;

  const cached =
    await cacheGet<{ items: unknown[]; total: number }>(cacheKey);
  if (cached) {
    response.json({ ...cached, cached: true });
    return;
  }

  if (ranked) {
    const page = await rankedOpportunities(userId, { ...filters, limit, offset });
    const payload = { items: page.items, total: page.total };
    await cacheSet(cacheKey, payload, filters.semantic ? 20 : 45);
    response.json({ ...payload, cached: false });
    return;
  }

  // The unranked feed is the whole catalogue: a page of rows and the real
  // number of rows that match, so the pager can show where it is.
  const [items, total] = await Promise.all([
    listOpportunities({ ...filters, limit, offset }),
    countOpportunities(filters),
  ]);
  const payload = { items, total };
  await cacheSet(cacheKey, payload, filters.semantic ? 20 : 45);
  response.json({ ...payload, cached: false });
});

opportunitiesRouter.get("/:id", async (request, response) => {  const item = await getOpportunityWithMatch(
    response.locals.userId as string,
    request.params.id,
  );
  if (!item) {
    response.status(404).json({ error: "Opportunity not found" });
    return;
  }
  response.json({ ...item, item });
});

opportunitiesRouter.get("/:id/workspace", async (request, response) => {
  const workspace = await ensureBlueprint(request.params.id);
  response.json({ workspace });
});
