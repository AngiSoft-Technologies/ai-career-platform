import { query } from "../../db/pool.js";
import { runDiscoveryAgents } from "../agents/runner.js";

/**
 * Job discovery runner — agent-based only.
 *
 * No hardcoded source lists. Agents use search engines (Firecrawl, DuckDuckGo,
 * etc.) to find jobs across ALL platforms (LinkedIn, Facebook, NGO sites,
 * company career pages, Twitter, job boards, etc.), then browse pages to
 * extract full job details, deduplicate, and match to users by location.
 *
 * This is called from the BullMQ scheduler (default every 30 minutes via
 * INGESTION_INTERVAL_MINUTES).
 */
export async function runIngestion(): Promise<{
  status: "success" | "partial" | "failed";
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  error?: string;
}> {
  // 1. Run all due discovery agents (search → browse → dedupe → match)
  const agentResult = await runDiscoveryAgents();

  // 2. Expire opportunities older than 60 days
  const expired = await query(
    `UPDATE opportunities
        SET status = 'expired'
      WHERE status = 'active'
        AND posted_at < now() - interval '60 days'`,
  );

  console.log(
    `[ingest] agents: status=${agentResult.status} fetched=${agentResult.fetched} inserted=${agentResult.inserted} updated=${agentResult.updated} failed=${agentResult.failed} expired=${expired.rowCount ?? 0}`,
  );

  return agentResult;
}
