import { Router } from "express";
import { query } from "../db/pool.js";

export const statsRouter = Router();

interface PlatformStats {
  activeJobs: number;
  totalJobs: number;
  newThisWeek: number;
  countries: number;
  companies: number;
  sources: number;
  professions: number;
  generatedAt: string;
}

let cache: { value: PlatformStats; expiresAt: number } | null = null;
const CACHE_MS = 60_000;

async function loadStats(): Promise<PlatformStats> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  const result = await query<{
    active_jobs: string;
    total_jobs: string;
    new_this_week: string;
    countries: string;
    companies: string;
    sources: string;
    professions: string;
  }>(
    `SELECT
       (SELECT count(*) FROM opportunities WHERE status = 'active')::text AS active_jobs,
       (SELECT count(*) FROM opportunities)::text AS total_jobs,
       (SELECT count(*) FROM opportunities
         WHERE status = 'active' AND posted_at > now() - interval '7 days')::text AS new_this_week,
       (SELECT count(DISTINCT country) FROM opportunities WHERE status = 'active')::text AS countries,
       (SELECT count(*) FROM companies)::text AS companies,
       (SELECT count(DISTINCT platform) FROM opportunities)::text AS sources,
       (SELECT count(*) FROM profession_taxonomy)::text AS professions`,
  );

  const row = result.rows[0];
  const value: PlatformStats = {
    activeJobs: Number(row?.active_jobs ?? 0),
    totalJobs: Number(row?.total_jobs ?? 0),
    newThisWeek: Number(row?.new_this_week ?? 0),
    countries: Number(row?.countries ?? 0),
    companies: Number(row?.companies ?? 0),
    sources: Number(row?.sources ?? 0),
    professions: Number(row?.professions ?? 0),
    generatedAt: new Date().toISOString(),
  };

  cache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

statsRouter.get("/", async (_request, response, next) => {
  try {
    const stats = await loadStats();
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    response.json(stats);
  } catch (error) {
    next(error);
  }
});
