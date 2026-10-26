import { Router } from "express";
import { query } from "../db/pool.js";

export const publicRouter = Router();

// Debug endpoint to diagnose Fly.io routing issues
publicRouter.get("/debug", async (_request, response) => {
  response.json({
    message: "Public debug endpoint works",
    timestamp: new Date().toISOString(),
    headers: {
      "fly-request-id": _request.headers["fly-request-id"],
      "fly-client-id": _request.headers["fly-client-id"],
      "fly-replay": _request.headers["fly-replay"],
      "x-forwarded-for": _request.headers["x-forwarded-for"],
      "x-forwarded-proto": _request.headers["x-forwarded-proto"],
    },
  });
});

const COHORT_CAP = Number(process.env.COHORT_CAP ?? 500);
const CONTACT_WINDOW_MS = 60 * 60 * 1000;
const CONTACT_LIMIT = 5;

const contactAttempts = new Map<string, { count: number; resetAt: number }>();

function allowContact(key: string): boolean {
  const now = Date.now();
  const entry = contactAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    contactAttempts.set(key, { count: 1, resetAt: now + CONTACT_WINDOW_MS });
    return true;
  }
  if (entry.count >= CONTACT_LIMIT) return false;
  entry.count += 1;
  return true;
}

let cohortCache: { value: unknown; expiresAt: number } | null = null;

publicRouter.get("/cohort", async (_request, response, next) => {
  try {
    if (cohortCache && cohortCache.expiresAt > Date.now()) {
      response.json(cohortCache.value);
      return;
    }

    const result = await query<{ taken: string }>(
      `SELECT count(*)::text AS taken FROM users`,
    );
    const taken = Number(result.rows[0]?.taken ?? 0);
    const value = {
      cap: COHORT_CAP,
      taken,
      remaining: Math.max(0, COHORT_CAP - taken),
      closed: taken >= COHORT_CAP,
      generatedAt: new Date().toISOString(),
    };

    cohortCache = { value, expiresAt: Date.now() + 30_000 };
    response.setHeader("Cache-Control", "public, max-age=30");
    response.json(value);
  } catch (error) {
    next(error);
  }
});

interface FeaturedRow {
  id: string;
  title: string;
  company: string;
  country: string;
  city: string;
  work_mode: string;
  seniority: string;
  platform: string;
  posted_at: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  risk_score: number | null;
}

let featuredCache: { value: unknown; expiresAt: number } | null = null;

publicRouter.get("/featured", async (_request, response, next) => {
  try {
    if (featuredCache && featuredCache.expiresAt > Date.now()) {
      response.json(featuredCache.value);
      return;
    }

    const result = await query<FeaturedRow>(
      `SELECT o.id, o.title, c.name AS company, o.country, o.city, o.work_mode,
              o.seniority, o.platform, o.posted_at, o.salary_min, o.salary_max,
              o.currency, o.risk_score
         FROM opportunities o
         JOIN companies c ON c.id = o.company_id
        WHERE o.status = 'active'
        ORDER BY o.posted_at DESC
        LIMIT 6`,
    );

    const value = {
      jobs: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        company: row.company,
        country: row.country,
        city: row.city,
        workMode: row.work_mode,
        seniority: row.seniority,
        platform: row.platform,
        postedAt: row.posted_at,
        salaryMin: row.salary_min,
        salaryMax: row.salary_max,
        currency: row.currency,
        riskScore: row.risk_score,
      })),
      generatedAt: new Date().toISOString(),
    };

    featuredCache = { value, expiresAt: Date.now() + 60_000 };
    response.setHeader("Cache-Control", "public, max-age=60");
    response.json(value);
  } catch (error) {
    next(error);
  }
});

interface ContactBody {
  name?: unknown;
  email?: unknown;
  topic?: unknown;
  message?: unknown;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

publicRouter.post("/contact", async (request, response, next) => {
  try {
    const body = request.body as ContactBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 40) : "general";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (name.length < 2 || name.length > 120) {
      response.status(400).json({ error: "Please tell us your name", code: "INVALID_NAME" });
      return;
    }
    if (!emailPattern.test(email) || email.length > 254) {
      response.status(400).json({ error: "That email address looks incomplete", code: "INVALID_EMAIL" });
      return;
    }
    if (message.length < 10 || message.length > 4000) {
      response.status(400).json({
        error: "Give us a little more detail (10 to 4000 characters)",
        code: "INVALID_MESSAGE",
      });
      return;
    }

    const key = request.ip ?? "unknown";
    if (!allowContact(key)) {
      response.status(429).json({
        error: "You have sent several messages. Please try again later.",
        code: "RATE_LIMITED",
      });
      return;
    }

    await query(
      `INSERT INTO contact_messages (name, email, topic, message, source)
       VALUES ($1, $2, $3, $4, 'website')`,
      [name, email, topic, message],
    );

    response.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
