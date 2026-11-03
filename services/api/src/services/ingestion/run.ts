import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { runDiscoveryAgents } from "../agents/runner.js";
import { DeduplicationAgent } from "../agents/dedup-agent.js";
import { assessEligibility } from "../engine/eligibility.js";

/**
 * Job discovery runner.
 *
 * Order matters and is enforced here:
 *   1. Agents discover (direct feeds first, then search → browse → expansion).
 *   2. Deduplicate pending candidates.
 *   3. PROMOTE verified candidates into `opportunities` — this step was
 *      missing before, which is why no new jobs ever reached the product.
 *   4. Apply geographic eligibility to every promoted record, so the catalogue
 *      can say *why* a job fits a Kenyan candidate instead of guessing.
 *   5. Re-verify freshness of live listings and expire the dead ones.
 *
 * The matching agent runs on its own schedule and reads verified candidates.
 *
 * Called from the BullMQ scheduler every INGESTION_INTERVAL_MINUTES (30).
 */
export async function runIngestion(): Promise<{
  status: "success" | "partial" | "failed";
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  expired: number;
  error?: string;
}> {
  // 1. Agents (direct feeds first, then search → browse)
  const agentResult = await runDiscoveryAgents();

  // 2–3. Deduplicate + promote. Promotion must run even when the dedup agent
  // was not due on this tick, otherwise verified rows sit forever.
  const dedup = new DeduplicationAgent();
  const dedupRow = await query<{ id: string }>(
    `SELECT id FROM discovery_agents WHERE key = $1 AND status = 'active'`,
    [dedup.key],
  );
  const dedupAgentId = dedupRow.rows[0]?.id;
  if (dedupAgentId) {
    const dedupResult = await dedup.run({
      agentId: dedupAgentId,
      agentKey: dedup.key,
      config: dedup.agentConfig,
    });
    await dedup.recordRun(dedupResult);
  }

  const promotion = await dedup.promoteVerifiedCandidates();

  // 4. Eligibility. Applied after promotion so it never blocks ingestion, and
  //    stored as columns the feed can filter and explain on.
  const eligibility = await applyEligibility();

  // 5. Freshness: expire listings that no longer advertise a vacancy, and
  //    drop anything whose body no longer looks like a job at all.
  const expired = await query(
    `UPDATE opportunities
        SET status = 'expired'
      WHERE status = 'active'
        AND (
          posted_at < now() - interval '60 days'
          OR (
            description IS NOT NULL
            AND length(description) > 200
            AND description !~* '(apply|hiring|vacanc|responsibilit|qualification|requirement)'
            AND updated_at < now() - interval '14 days'
          )
        )`,
  );

  // 6. Flip sources that stopped producing anything to a backoff state rather
  //    than re-crawling a dead board every cycle.
  const quietedSources = await quietEmptySources();

  logger.info(
    {
      agents: agentResult,
      candidatesPromoted: promotion.promoted,
      promotionFailures: promotion.failed,
      eligibilityScored: eligibility,
      expired: expired.rowCount ?? 0,
      sourcesBackedOff: quietedSources,
    },
    "Ingestion cycle complete",
  );

  return {
    ...agentResult,
    inserted: agentResult.inserted + promotion.promoted,
    expired: expired.rowCount ?? 0,
  };
}

async function applyEligibility(): Promise<number> {
  const rows = await query<{
    id: string;
    title: string;
    description: string | null;
    country: string | null;
    city: string | null;
    work_mode: string | null;
  }>(
    `SELECT id, title, description, country, city, work_mode
       FROM opportunities
      WHERE status = 'active'
        AND eligibility IS NULL
      LIMIT 400`,
  );

  let scored = 0;
  for (const row of rows.rows) {
    const result = assessEligibility({
      title: row.title,
      description: row.description ?? "",
      location: [row.city, row.country].filter(Boolean).join(", ") || null,
      country: row.country,
      city: row.city,
    });

    await query(
      `UPDATE opportunities
          SET eligibility = $2,
              eligibility_reasons = $3,
              eligibility_confidence = $4,
              updated_at = now()
        WHERE id = $1`,
      [
        row.id,
        result.eligibility,
        JSON.stringify(result.reasons),
        result.confidence,
      ],
    ).catch(() => undefined);
    scored += 1;
  }
  return scored;
}

async function quietEmptySources(): Promise<number> {
  // A source with no importable rows for two cycles gets pushed back an hour,
  // which is enough to stop starving productive sources.
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM discovery_known_sources
      WHERE jobs_found = 0
        AND last_seen < now() - interval '2 hours'`,
  );
  return Number(result.rows[0]?.count ?? 0);
}
