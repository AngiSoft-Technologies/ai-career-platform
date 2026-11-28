import { Router, type Request } from "express";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { assertPublicUrl } from "../services/engine/fetch.js";
import { directFetch } from "../services/engine/egress.js";
import { runIngestion } from "../services/ingestion/run.js";
import { runServerlessPreparationCycle } from "../services/application/serverless-preparations.js";
import { runBackendCycle } from "../services/serverless/backend-cycle.js";
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
 * token. A scheduled call answers immediately and keeps working through
 * `waitUntil`; a full discovery cycle takes longer than the platform's
 * response budget, and a timed-out invocation is recorded as a failure even
 * when the work itself succeeded.
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
    request.query.wait === "1" || request.query.wait === "true";
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

  // The schedule only needs to know the clock fired: waiting for discovery
  // here makes every invocation time out at 300s, and the scheduled run is
  // marked failed even though promotion already put jobs in the catalogue.
  // `waitUntil` keeps the function alive for the rest of the cycle after the
  // response is on its way. Locally it is a no-op and the promise still runs.
  if (auth.scheduled) {
    response.json({ success: true, accepted: true, scheduled: true });
    waitUntil(execute());
    return;
  }

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

const PREPARATION_SCHEDULE_LOCK_KEY = "preparation:schedule:lock";

/**
 * Serverless preparation clock.
 *
 * There is no BullMQ consumer on Vercel, so a QUEUED row would otherwise wait
 * forever. Vercel Schedules calls this route every 15 minutes; a user clicking
 * "prepare" also starts the same pipeline immediately through `waitUntil` in
 * the public route. This endpoint is the safety net for interrupted runs,
 * automatic preparations, and rows whose original invocation timed out.
 */
internalRouter.post("/prepare", async (request, response) => {
  const auth = ingestAuthorisation(request);
  if (!auth.ok) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const requestedLimit = Number(request.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 5)
    : undefined;
  const wait =
    request.query.wait === "1" || request.query.wait === "true";
  const started = Date.now();

  let releaseLock: (() => Promise<void>) | null = null;
  if (auth.scheduled) {
    let acquired = false;
    try {
      acquired =
        (await redis.set(
          PREPARATION_SCHEDULE_LOCK_KEY,
          "1",
          "EX",
          280,
          "NX",
        )) === "OK";
    } catch {
      acquired = true;
    }
    if (!acquired) {
      response.status(202).json({ success: true, skipped: "cycle already running" });
      return;
    }
    releaseLock = async () => {
      await redis.del(PREPARATION_SCHEDULE_LOCK_KEY).catch(() => undefined);
    };
  }

  const execute = async () => {
    try {
      // A scheduled hit is the Vercel fallback clock for the whole backend;
      // operator calls can request the same full cycle with ?full=1.
      const fullCycle = auth.scheduled || request.query.full === "1";
      const result = fullCycle
        ? await runBackendCycle({ limit, scheduleAutomatic: true })
        : await runServerlessPreparationCycle({ limit });
      logger.info(
        { cycle: result, elapsedMs: Date.now() - started, scheduled: auth.scheduled },
        "Serverless backend cycle finished",
      );
      return result;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Backend cycle failed",
      );
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (releaseLock) await releaseLock();
    }
  };

  if (auth.scheduled) {
    response.json({ success: true, accepted: true, scheduled: true });
    waitUntil(execute());
    return;
  }

  if (wait) {
    response.json({ success: true, result: await execute() });
    return;
  }

  response.status(202).json({
    success: true,
    accepted: true,
    message: "Preparation cycle started. Poll the preparation status.",
  });
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
