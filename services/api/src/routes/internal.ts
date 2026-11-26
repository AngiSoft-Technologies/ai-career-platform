import { Router, type Request } from "express";
import { z } from "zod";
import { assertPublicUrl } from "../services/engine/fetch.js";
import { directFetch } from "../services/engine/egress.js";
import { runIngestion } from "../services/ingestion/run.js";
import { DeduplicationAgent } from "../services/agents/dedup-agent.js";
import { query } from "../db/pool.js";
import { redis } from "../db/redis.js";
import { logger } from "../logger.js";

/**
 * Internal-only egress endpoint.
 *
 * This is how our own egress proxy works: a worker can ask another API
 * instance to perform a request, so the target site sees that instance's IP
 * instead of the worker's. No third-party proxy provider is involved.
 *
 * It is not a public endpoint: callers must present the shared internal
 * token, and deployments should keep `/internal/*` off the public edge.
 */
export const internalRouter = Router();

const egressSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
});

internalRouter.post("/egress", async (request, response) => {
  const expected = process.env.EGRESS_TOKEN;
  const supplied = request.header("x-egress-token");
  if (!expected || supplied !== expected) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = egressSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  try {
    // Same SSRF rules as the main fetcher.
    const target = await assertPublicUrl(parsed.data.url);
    // Never forward credentials through the egress hop.
    const safeHeaders = Object.fromEntries(
      Object.entries(parsed.data.headers ?? {}).filter(
        ([name]) =>
          !["authorization", "cookie", "proxy-authorization"].includes(
            name.toLowerCase(),
          ),
      ),
    );
    const result = await directFetch(target.toString(), {
      method: parsed.data.method,
      headers: safeHeaders,
      signal: AbortSignal.timeout(25_000),
    });

    response.json({
      status: result.status,
      headers: result.headers,
      bodyBase64: Buffer.from(result.body).toString("base64"),
      finalUrl: result.finalUrl,
    });
  } catch (error) {
    response.status(502).json({
      error: "Egress request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const SCHEDULE_LOCK_KEY = "discovery:schedule:lock";
const SCHEDULE_LAST_RUN_KEY = "discovery:schedule:last-run";

/**
 * Two callers may trigger ingestion: a Vercel Schedule (which sends
 * `Authorization: Bearer $CRON_SECRET`) and an operator with the internal
 * token. A scheduled call always runs synchronously, because a detached
 * promise dies when a serverless function returns.
 */
function ingestAuthorisation(request: Request): { ok: boolean; scheduled: boolean } {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.header("authorization");
  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return { ok: true, scheduled: true };
  }

  const internalToken = process.env.EGRESS_TOKEN ?? process.env.INTERNAL_API_KEY;
  if (internalToken && request.header("x-egress-token") === internalToken) {
    return { ok: true, scheduled: false };
  }

  return { ok: false, scheduled: false };
}

/**
 * Runs one discovery cycle.
 *
 * On serverless the platform schedule is the clock: Vercel Schedules POSTs here
 * every 30 minutes with CRON_SECRET. The standalone worker still dispatches the
 * same work through its own ticker, so this route is the only discovery entry
 * point both topologies share.
 *
 * Function targets are not retried and runs can overlap after an outage, so a
 * scheduled cycle takes a short Redis lease. If Redis is down the cycle still
 * runs — discovery deduplicates by source URL, so an occasional overlap is
 * safe — but the lease is skipped rather than blocking the only clock we have.
 */
internalRouter.post("/ingest", async (request, response) => {
  const auth = ingestAuthorisation(request);
  if (!auth.ok) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const wait =
    auth.scheduled ||
    request.query.wait === "1" ||
    request.query.wait === "true";
  const started = Date.now();

  let releaseLock: (() => Promise<void>) | null = null;
  if (auth.scheduled) {
    let acquired = false;
    try {
      acquired =
        (await redis.set(SCHEDULE_LOCK_KEY, "1", "EX", 1_500, "NX")) === "OK";
    } catch {
      // No Redis means no lease; never let that stop the scheduled cycle.
      acquired = true;
    }
    if (!acquired) {
      response.status(202).json({ success: true, skipped: "cycle already running" });
      return;
    }
    releaseLock = async () => {
      await redis.del(SCHEDULE_LOCK_KEY).catch(() => undefined);
    };
  }

  const execute = async () => {
    try {
      const result = await runIngestion();
      logger.info(
        { ingest: result, elapsedMs: Date.now() - started, scheduled: auth.scheduled },
        "Ingestion cycle finished",
      );
      if (auth.scheduled) {
        await redis
          .set(SCHEDULE_LAST_RUN_KEY, new Date().toISOString())
          .catch(() => undefined);
      }
      return result;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Ingestion cycle failed",
      );
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (releaseLock) await releaseLock();
    }
  };

  if (wait) {
    response.json({ success: true, result: await execute() });
    return;
  }

  response.status(202).json({
    success: true,
    accepted: true,
    message: "Ingestion cycle started. Poll /internal/discovery-status.",
  });

  // Deliberately not awaited: only used by operators on a persistent host.
  void execute();
});

/**
 * Deduplicate and promote, without running the discovery agents.
 *
 * Discovery is slow by nature (it walks employers politely), so promotion is
 * deliberately decoupled from it: this endpoint turns whatever the agents have
 * already verified into live catalogue rows in seconds. The scheduler calls
 * both on their own cadences.
 */
internalRouter.post("/promote", async (request, response) => {
  const expected = process.env.EGRESS_TOKEN ?? process.env.INTERNAL_API_KEY;
  const supplied = request.header("x-egress-token");
  if (!expected || supplied !== expected) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const dedup = new DeduplicationAgent();
    const row = await query<{ id: string }>(
      `SELECT id FROM discovery_agents WHERE key = $1 AND status = 'active'`,
      [dedup.key],
    );

    let dedupResult: Awaited<ReturnType<typeof dedup.run>> | null = null;
    if (row.rows[0]?.id) {
      dedupResult = await dedup.run({
        agentId: row.rows[0].id,
        agentKey: dedup.key,
        config: dedup.agentConfig,
      });
      await dedup.recordRun(dedupResult);
    }

    const promotion = await dedup.promoteVerifiedCandidates();

    logger.info(
      {
        verified: dedupResult?.jobsNew ?? 0,
        promoted: promotion.promoted,
        failed: promotion.failed,
      },
      "Deduplication + promotion finished",
    );

    response.json({
      success: true,
      verified: dedupResult?.jobsNew ?? 0,
      promoted: promotion.promoted,
      failed: promotion.failed,
    });
  } catch (error) {
    response.status(502).json({
      error: "Promotion failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
/**
 * Discovery status: what the pipeline actually has right now. This is the
 * number that answers "are the agents producing fresh jobs?".
 */
internalRouter.get("/discovery-status", async (request, response) => {
  const expected = process.env.EGRESS_TOKEN ?? process.env.INTERNAL_API_KEY;
  const supplied = request.header("x-egress-token");
  if (!expected || supplied !== expected) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [
      live,
      candidates,
      pending,
      imported,
      runs,
      latestRun,
      newest,
      eligibility,
      platforms,
      sources,
    ] = await Promise.all([
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM opportunities WHERE status = 'active'`,
      ),
      query<{ count: string }>(`SELECT count(*)::text AS count FROM discovery_candidates`),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM discovery_candidates WHERE status = 'pending'`,
      ),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM discovery_candidates WHERE status = 'imported'`,
      ),
      query<{ count: string }>(`SELECT count(*)::text AS count FROM discovery_agent_runs`),
      query<{
        key: string;
        status: string;
        jobs_found: number | null;
        jobs_new: number | null;
        finished_at: Date | null;
      }>(
        `SELECT a.key, r.status, r.jobs_found, r.jobs_new, r.finished_at
           FROM discovery_agent_runs r
           JOIN discovery_agents a ON a.id = r.agent_id
          ORDER BY r.finished_at DESC NULLS LAST
          LIMIT 8`,
      ),
      query<{ newest: Date | null; titles: string[] }>(
        `SELECT max(created_at) AS newest, array_agg(title ORDER BY created_at DESC) AS titles
           FROM (SELECT title, created_at FROM opportunities ORDER BY created_at DESC LIMIT 5) recent`,
      ),
      query<{ eligibility: string | null; count: string }>(
        `SELECT eligibility, count(*)::text AS count
           FROM opportunities
          WHERE status = 'active' AND eligibility IS NOT NULL
          GROUP BY eligibility`,
      ),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM discovery_platform_targets WHERE enabled = true`,
      ),
      query<{ platform: string; count: string }>(
        `SELECT source_platform AS platform, count(*)::text AS count
           FROM discovery_candidates
          GROUP BY source_platform
          ORDER BY count(*) DESC
          LIMIT 12`,
      ),
    ]);

    response.json({
      liveOpportunities: Number(live.rows[0]?.count ?? 0),
      candidates: Number(candidates.rows[0]?.count ?? 0),
      pendingCandidates: Number(pending.rows[0]?.count ?? 0),
      importedCandidates: Number(imported.rows[0]?.count ?? 0),
      agentRuns: Number(runs.rows[0]?.count ?? 0),
      latestRuns: latestRun.rows,
      newestOpportunity: newest.rows[0]?.newest ?? null,
      freshestTitles: newest.rows[0]?.titles ?? [],
      eligibilityBreakdown: eligibility.rows,
      platformTargets: Number(platforms.rows[0]?.count ?? 0),
      topSources: sources.rows,
    });
  } catch (error) {
    response.status(502).json({
      error: "Status query failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
