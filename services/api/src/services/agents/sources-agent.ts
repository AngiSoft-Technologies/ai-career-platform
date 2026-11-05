import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import { fetchFreeJobs } from "../engine/sources.js";
import { computeFingerprint, computeSimhash } from "../engine/extract.js";

/**
 * Direct Job Feed Agent.
 *
 * Pulls from public, key-less job APIs (RemoteOK, Remotive, Arbeitnow, Jobicy,
 * Himalayas, ReliefWeb). This is the reliability layer: even if every search
 * engine blocks our egress IP, this agent still produces fresh jobs.
 *
 * No external agent, no paid API, no vendor key.
 */
export class DirectSourcesAgent extends BaseDiscoveryAgent {
  readonly key = "direct_sources_agent";
  readonly name = "Direct Job Feed Agent";
  readonly kind = "direct_sources";
  readonly scheduleIntervalMinutes = 30;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const { jobs, results } = await fetchFreeJobs();

    let stored = 0;
    let duplicate = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      try {
        const fingerprint = computeFingerprint(
          job.company ?? "unknown",
          job.title,
          job.city ?? "",
          job.postedAt,
        );
        const simhash = computeSimhash(
          `${job.company ?? ""} ${job.title} ${job.description}`,
        );

        const existing = await query<{ id: string }>(
          `SELECT id FROM discovery_candidates
            WHERE fingerprint = $1 OR source_url = $2
            LIMIT 1`,
          [fingerprint, job.url],
        );
        if (existing.rows.length > 0) {
          duplicate += 1;
          continue;
        }

        // The conflict on the URL is handled rather than left to fail.
        // Two agents can reach the same posting at the same time — the
        // board is read by every worker that runs the cycle — and the
        // second insert would violate the unique constraint on the URL,
        // which counted as a failure of the whole source.
        const inserted = await query<{ id: string }>(
          `INSERT INTO discovery_candidates
              (external_id, source_platform, source_url, title, company,
               description, location_raw, country, city, work_mode,
               employment_type, salary_min, salary_max, currency, apply_url,
               skills, posted_at, simhash, fingerprint, status,
               discovered_by_agent_id, discovered_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   $14, $15, $16, $17, $18, $19, 'pending', $20, now(), now())
           ON CONFLICT (source_url) DO NOTHING
           RETURNING id`,
          [
            job.externalId,
            job.sourcePlatform,
            job.url,
            job.title,
            job.company,
            job.description,
            job.location,
            job.country,
            job.city,
            job.workMode,
            job.employmentType,
            job.salaryMin,
            job.salaryMax,
            job.currency,
            job.applyUrl,
            job.skills,
            job.postedAt,
            simhash,
            fingerprint,
            ctx.agentId,
          ],
        );
        if (inserted.rows.length > 0) stored += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${job.sourcePlatform}: ${message}`);
        logger.debug({ error: message, url: job.url }, "Direct source insert failed");
      }
    }

    for (const result of results) {
      if (result.error) {
        errors.push(`${result.source}: ${result.error}`);
      }
    }

    return {
      status: stored === 0 && failed > 0 ? "failed" : "success",
      jobsFound: jobs.length,
      jobsNew: stored,
      jobsDuplicate: duplicate,
      error: errors.length > 0 ? errors.slice(0, 10).join("; ") : undefined,
      payload: {
        sources: results.map((result) => ({
          source: result.source,
          found: result.jobs.length,
          error: result.error,
        })),
      },
    };
  }
}
