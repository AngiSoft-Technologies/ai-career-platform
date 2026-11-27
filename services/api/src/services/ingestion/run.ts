import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { runDiscoveryAgents, runPostPromotionAgents } from "../agents/runner.js";
import { DeduplicationAgent } from "../agents/dedup-agent.js";
import { assessEligibility } from "../engine/eligibility.js";

/**
 * Job discovery runner.
 *
 * Order matters and is enforced here:
 *   1. Deduplicate pending candidates.
 *   2. PROMOTE verified candidates into `opportunities` — this step was
 *      missing before, which is why no new jobs ever reached the product.
 *   3. Apply geographic eligibility to every promoted record, so the catalogue
 *      can say *why* a job fits a Kenyan candidate instead of guessing.
 *   4. Run the post-promotion agents against the fresh catalogue rows.
 *   5. Agents discover (direct feeds first, then search → browse → expansion).
 *      This is last on purpose: discovery is slow, and a timeout here must not
 *      hold the jobs already waiting in the catalogue hostage.
 *   6. Flip quiet sources into backoff.
 *
 * Freshness is handled by the maintenance job, not here.
 *
 * Called from the Vercel Schedule every 30 minutes on serverless, and from
 * the BullMQ scheduler on a persistent host.
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
  // 1–2. Deduplicate + promote FIRST.
  //
  // Promotion is the step that puts jobs in front of candidates, so it must
  // not sit behind discovery. Discovery walks employers politely and can take
  // the whole function timeout; when it ran first the verified candidates
  // piled up while the catalogue received nothing. Promoting what is already
  // verified is fast, and the agents below top the queue up for next time.
  const dedup = new DeduplicationAgent();
  let promotion = { promoted: 0, failed: 0 };
  const dedupRow = await query<{ id: string }>(
    `SELECT id FROM discovery_agents WHERE key = $1 AND status = 'active'`,
    [dedup.key],
  ).catch(() => ({ rows: [] as Array<{ id: string }> }));

  try {
    const dedupAgentId = dedupRow.rows[0]?.id;
    if (dedupAgentId) {
      const dedupResult = await dedup.run({
        agentId: dedupAgentId,
        agentKey: dedup.key,
        config: dedup.agentConfig,
      });
      await dedup.recordRun(dedupResult);
    }
    promotion = await dedup.promoteVerifiedCandidates();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Deduplication or promotion failed this cycle",
    );
  }

  // 4. Eligibility. Applied after promotion so it never blocks ingestion, and
  //    stored as columns the feed can filter and explain on.
  let eligibility = 0;
  try {
    eligibility = await applyEligibility();
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Eligibility scoring failed this cycle",
    );
  }

  // 4b. Catalogue-phase agents. These read the opportunities the promotion
  //     step just wrote, so they have to run after it — the matching agent
  //     stores an opportunity id in `matches`, and that column is a foreign
  //     key to `opportunities`.
  let matching = { fetched: 0, inserted: 0, failed: 0 };
  try {
    matching = await runPostPromotionAgents();
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Post-promotion agents failed this cycle",
    );
  }

  // 3. Discovery agents (direct feeds first, then search → browse →
  //    expansion). This is deliberately last: it walks employers politely,
  //    can take the whole function timeout, and every candidate it finds is
  //    promoted by the *next* cycle. A slow crawl must never hold the jobs
  //    already waiting in the catalogue hostage.
  let agentResult: Awaited<ReturnType<typeof runDiscoveryAgents>>;
  try {
    agentResult = await runDiscoveryAgents();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Discovery agents failed this cycle; promotion already ran",
    );
    agentResult = {
      status: "partial",
      fetched: 0,
      inserted: 0,
      updated: 0,
      failed: 1,
      error: error instanceof Error ? error.message : "DISCOVERY_FAILED",
    };
  }

  // 5. Freshness is handled by the maintenance job, not here.
  //
  //    Expiring stale listings means reading the description of every active
  //    opportunity and matching it against a regular expression, which is the
  //    single most expensive statement the system runs. It used to run on
  //    every ingestion cycle — every thirty seconds — and it accounted for
  //    most of the database's total execution time, which starved the
  //    queries the app makes on behalf of a signed-in user.
  //
  //    Listing freshness does not need thirty-second resolution: a listing
  //    that is sixty days old is still old in five minutes. The sweep now
  //    runs on the maintenance cadence, where it belongs.
  const expiredCount = 0;

  // 6. Flip sources that stopped producing anything to a backoff state rather
  //    than re-crawling a dead board every cycle.
  let quietedSources = 0;
  try {
    quietedSources = await quietEmptySources();
  } catch {
    // Purely advisory; never fails a cycle.
  }

  logger.info(
    {
      agents: agentResult,
      candidatesPromoted: promotion.promoted,
      promotionFailures: promotion.failed,
      eligibilityScored: eligibility,
      matchesCreated: matching.inserted,
      expired: expiredCount,
      sourcesBackedOff: quietedSources,
    },
    "Ingestion cycle complete",
  );

  return {
    ...agentResult,
    inserted: agentResult.inserted + promotion.promoted,
    expired: expiredCount,
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
