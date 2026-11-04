import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";

/**
 * Learning Agent
 *
 * Tracks which search queries and platforms produce high-quality jobs,
 * and updates agent configurations over time. The system "learns" which
 * sources work best for different regions, roles, and job types.
 *
 * Also discovers new job sources from successful URLs and adds them to
 * a known_sources table so future searches can prioritize them.
 */
export class LearningAgent extends BaseDiscoveryAgent {
  readonly key = "learning_agent";
  readonly name = "Source Learning Agent";
  readonly kind = "learning";
  readonly scheduleIntervalMinutes = 120;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    try {
      await this.updateSourceQuality();
      await this.discoverNewSources();
      await this.optimizeSearchQueries();
      return {
        status: "success",
        jobsFound: 0,
        jobsNew: 0,
        jobsDuplicate: 0,
        payload: { message: "Learning cycle complete" },
      };
    } catch (error) {
      return {
        status: "failed",
        jobsFound: 0,
        jobsNew: 0,
        jobsDuplicate: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Updates quality scores for sources based on how many verified jobs
   * they produce vs. how many are rejected/duplicates.
   */
  private async updateSourceQuality(): Promise<void> {
    // Calculate quality score per platform based on verified/imported ratio
    await query(`
      WITH source_stats AS (
        SELECT
          source_platform,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'imported') as imported,
          COUNT(*) FILTER (WHERE status = 'verified') as verified,
          COUNT(*) FILTER (WHERE status = 'duplicate') as duplicates,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected
        FROM discovery_candidates
        GROUP BY source_platform
      )
      INSERT INTO discovery_source_quality (source_platform, total_jobs, imported_jobs, verified_jobs, duplicate_jobs, rejected_jobs, quality_score, updated_at)
      SELECT
        source_platform, total, imported, verified, duplicates, rejected,
        ROUND(
          (imported::numeric * 1.0 + verified::numeric * 0.5) / NULLIF(total::numeric, 0) * 100,
          2
        ) as quality_score,
        now()
      FROM source_stats
      ON CONFLICT (source_platform) DO UPDATE SET
        total_jobs = EXCLUDED.total_jobs,
        imported_jobs = EXCLUDED.imported_jobs,
        verified_jobs = EXCLUDED.verified_jobs,
        duplicate_jobs = EXCLUDED.duplicate_jobs,
        rejected_jobs = EXCLUDED.rejected_jobs,
        quality_score = EXCLUDED.quality_score,
        updated_at = now()
    `);
  }

  /**
   * Discovers new job sources from successful candidate URLs and stores
   * them so future searches can prioritize known-good platforms.
   */
  private async discoverNewSources(): Promise<void> {
    // The domain is the key, so there has to be exactly one row per
    // domain.
    //
    // It used to group by the domain *and* the source type, and the type
    // was derived from the full URL. The same domain could then land in
    // the statement twice — once as a job board, once as an ATS — and
    // PostgreSQL refuses that: "ON CONFLICT DO UPDATE command cannot
    // affect row a second time". The type is now a function of the
    // domain, so grouping by the domain alone is enough.
    await query(`
      WITH normalised AS (
        SELECT lower(
                 split_part(
                   split_part(split_part(source_url, '://', 2), '/', 1),
                   ':',
                   1
                 )
               ) AS domain
          FROM discovery_candidates
         WHERE status IN ('verified', 'imported')
           AND source_url IS NOT NULL
           AND source_url LIKE 'http%://%'
      ),
      typed AS (
        SELECT
          domain,
          CASE
            WHEN domain = 'linkedin.com' OR domain LIKE '%.linkedin.com'
              THEN 'professional_network'
            WHEN domain = 'facebook.com' OR domain LIKE '%.facebook.com'
              THEN 'social_media'
            WHEN domain = 'twitter.com' OR domain LIKE '%.twitter.com'
              OR domain = 'x.com' OR domain LIKE '%.x.com'
              THEN 'social_media'
            WHEN domain LIKE '%ngo%' OR domain LIKE '%un.org'
              OR domain LIKE '%worldbank.org'
              THEN 'ngo'
            WHEN domain = 'lever.co' OR domain LIKE '%.lever.co'
              OR domain = 'greenhouse.io' OR domain LIKE '%.greenhouse.io'
              OR domain = 'workable.com' OR domain LIKE '%.workable.com'
              THEN 'ats'
            ELSE 'job_board'
          END AS source_type,
          COUNT(*) AS jobs_found
          FROM normalised
         GROUP BY domain
      )
      INSERT INTO discovery_known_sources (domain, source_type, jobs_found, last_seen, created_at)
      SELECT domain, source_type, jobs_found, now(), now()
        FROM typed
      ON CONFLICT (domain) DO UPDATE SET
        -- A snapshot, not a running total. Adding the same candidates
        -- again every cycle made the number grow forever, and a source
        -- that was seen first always outranked a better one.
        jobs_found = EXCLUDED.jobs_found,
        last_seen = now()
    `);
  }

  /**
   * Optimizes search queries based on what's working. De-emphasizes queries
   * that produce few results and emphasizes queries that produce quality jobs.
   */
  private async optimizeSearchQueries(): Promise<void> {
    // Find the best-performing queries by looking at what queries led to imported jobs
    const goodQueries = await query<{ query: string; count: number }>(
      `SELECT dsr.query, COUNT(dc.id) as imported_count
         FROM discovery_search_results dsr
         JOIN discovery_candidates dc ON dc.source_url = dsr.source_url
        WHERE dc.status = 'imported'
        GROUP BY dsr.query
        ORDER BY imported_count DESC
        LIMIT 20`,
    );

    logger.info(
      { goodQueries: goodQueries.rows.length },
      "Learning agent: top performing queries identified",
    );

    // Update the search engine agent config to prioritize good queries
    if (goodQueries.rows.length > 0) {
      const topQueries = goodQueries.rows.map((r) => r.query);
      await query(
        `UPDATE discovery_agents
            SET config = jsonb_set(config, '{queries}', $1::jsonb),
                updated_at = now()
          WHERE key = $2`,
        [JSON.stringify(topQueries), "search_engine_agent"],
      );
    }
  }
}
