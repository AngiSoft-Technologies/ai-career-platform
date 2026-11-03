import { Router } from "express";
import { z } from "zod";
import { assertPublicUrl } from "../services/engine/fetch.js";
import { directFetch } from "../services/engine/egress.js";
import { runIngestion } from "../services/ingestion/run.js";
import { DeduplicationAgent } from "../services/agents/dedup-agent.js";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";

/**
 * Internal-only egress endpoint.
 *
 * This is how our own multi-region proxy works: a worker can ask any other
 * API Machine (in a different Fly region) to perform a request, so the target
 * site sees that Machine's IP instead of the worker's. No third-party proxy
 * provider is involved.
 *
 * It is never exposed publicly: Fly routes `/internal/*` only over the private
 * 6PN network when the service is configured that way, and we additionally
 * require a shared token.
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

/**
 * Runs one discovery cycle on demand.
 *
 * The scheduler normally fires this every 30 minutes; this endpoint exists so
 * an operator (or a CI check) can force a cycle. A full cycle walks many
 * employers and can take minutes, so it runs detached: the caller gets a 202
 * immediately and reads the outcome from `/internal/discovery-status` or the
 * logs. It is guarded by the same shared token as the egress hop.
 */
internalRouter.post("/ingest", async (request, response) => {
  const expected = process.env.EGRESS_TOKEN ?? process.env.INTERNAL_API_KEY;
  const supplied = request.header("x-egress-token");
  if (!expected || supplied !== expected) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const wait = request.query.wait === "1" || request.query.wait === "true";
  const started = Date.now();

  const run = async (): Promise<void> => {
    try {
      const result = await runIngestion();
      logger.info(
        { ingest: result, elapsedMs: Date.now() - started },
        "On-demand ingestion cycle finished",
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "On-demand ingestion cycle failed",
      );
    }
  };

  if (wait) {
    // Bound the synchronous path so a slow cycle cannot hold the request
    // open past the proxy limit; the detached path is the default.
    const result = await runIngestion().catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    response.json({ success: true, result });
    return;
  }

  response.status(202).json({
    success: true,
    accepted: true,
    message: "Ingestion cycle started. Poll /internal/discovery-status.",
  });

  // Deliberately not awaited: the response has already been sent.
  void run();
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
