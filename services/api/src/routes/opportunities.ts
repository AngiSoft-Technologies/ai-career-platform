import { Router } from "express";
import { z } from "zod";
import { cacheGet, cacheSet } from "../db/redis.js";
import { ensureBlueprint } from "../services/applications.js";
import { requirePermission } from "../middleware/rbac.js";
import {
  getOpportunityWithMatch,
  rankedOpportunities,
} from "../services/matching.js";
import {
  listHeldOpportunities,
  listOpportunities,
} from "../services/opportunities.js";

const searchSchema = z.object({
  country: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
  employmentType: z
    .enum(["full_time", "part_time", "contract", "internship", "trainee", "industrial_attachment"])
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

opportunitiesRouter.get("/", async (request, response) => {
  const userId = response.locals.userId as string;
  const filters = searchSchema.parse(request.query);
  const ranked = filters.ranked ?? true;
  const cacheKey = `opportunities:${userId}:${ranked}:${JSON.stringify(filters)}`;

  const cached =
    await cacheGet<Awaited<ReturnType<typeof rankedOpportunities>>>(cacheKey);
  if (cached) {
    response.json({ items: cached, cached: true });
    return;
  }

  const items = ranked
    ? await rankedOpportunities(userId, filters)
    : await listOpportunities(filters);

  await cacheSet(cacheKey, items, filters.semantic ? 20 : 45);
  response.json({ items, cached: false });
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
