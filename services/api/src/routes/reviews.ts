import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { query } from "../db/pool.js";

export const reviewsRouter = Router();

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const submitSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((value) => emailPattern.test(value), "That email address looks incomplete"),
  role: z.string().trim().max(80).optional(),
  rating: z.coerce.number().int().min(1, "Pick a rating from 1 to 5").max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(20, "A few more words helps others").max(1200),
  recommend: z.coerce.boolean().default(false),
});

/** Per-IP throttle: keeps one person from flooding the review queue. */
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export interface ReviewRow {
  id: string;
  name: string;
  role: string | null;
  rating: number;
  title: string | null;
  body: string;
  recommend: boolean;
  approved_at: string | null;
  created_at: string;
}

/**
 * Approved reviews, newest first. Public: no session, because these are shown
 * on the marketing site.
 */
reviewsRouter.get("/", async (_request, response, next) => {
  try {
    const result = await query<ReviewRow>(
      `SELECT id, name, role, rating, title, body, recommend, approved_at, created_at
         FROM reviews
        WHERE status = 'approved'
        ORDER BY approved_at DESC NULLS LAST, created_at DESC
        LIMIT 24`,
    );

    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
    response.json({
      reviews: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        rating: row.rating,
        title: row.title,
        body: row.body,
        recommend: row.recommend,
        approvedAt: row.approved_at,
        createdAt: row.created_at,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Summary used by the hero/stats band: average rating, count, and the share
 * who would recommend MboQara.
 */
reviewsRouter.get("/summary", async (_request, response, next) => {
  try {
    const result = await query<{ average: string | null; total: string; recommended: string }>(
      `SELECT round(avg(rating)::numeric, 2)::text AS average,
              count(*)::text AS total,
              count(*) FILTER (WHERE recommend)::text AS recommended
         FROM reviews
        WHERE status = 'approved'`,
    );

    const row = result.rows[0];
    const total = Number(row?.total ?? 0);
    const recommended = Number(row?.recommended ?? 0);

    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
    response.json({
      average: Number(row?.average ?? 0),
      total,
      recommendRate: total > 0 ? Math.round((recommended / total) * 100) : 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/** Submissions land as 'pending' and are reviewed before they appear. */
reviewsRouter.post("/", submitLimiter, async (request, response, next) => {
  try {
    const input = submitSchema.parse(request.body ?? {});

    await query(
      `INSERT INTO reviews (name, email, role, rating, title, body, recommend, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'website')`,
      [
        input.name,
        input.email,
        input.role || null,
        input.rating,
        input.title || null,
        input.body,
        input.recommend,
      ],
    );

    response.status(201).json({
      ok: true,
      message: "Thank you. Your review is published once it has been checked.",
    });
  } catch (error) {
    next(error);
  }
});
