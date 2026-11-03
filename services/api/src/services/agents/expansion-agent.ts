import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import { detectAts, discoverFromDomainDetailed, discoverFromSitemap, fetchAtsBoard } from "../engine/discover.js";
import type { AtsBoard, AtsKind } from "../engine/discover.js";
import { computeFingerprint, computeSimhash } from "../engine/extract.js";
import type { RawJob } from "../engine/sources.js";

const ATS_KIND_SET: Record<AtsKind, true> = {
  greenhouse: true,
  lever: true,
  ashby: true,
  workable: true,
  smartrecruiters: true,
  recruitee: true,
  workday: true,
  oracle: true,
};

/**
 * Expansion Agent.
 *
 * This is the "new site appears and is hiring" answer. It does not use a list
 * of employers:
 *
 *   1. Every URL ever discovered is inspected for an ATS signature. If a
 *      company uses Greenhouse/Lever/Ashby/Workable/SmartRecruiters/Recruitee,
 *      the agent pulls the company's whole public board.
 *   2. Domains that do not use an ATS are crawled: homepage → careers → job
 *      links, plus sitemap.xml.
 *   3. Boards and domains are remembered in `discovery_known_sources`, so the
 *      next run refreshes them and the search agent can target them.
 */
export class ExpansionAgent extends BaseDiscoveryAgent {
  readonly key = "expansion_agent";
  readonly name = "ATS & Careers Expansion Agent";
  readonly kind = "expansion";
  readonly scheduleIntervalMinutes = 30;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const maxBoards = Number(ctx.config.max_boards_per_run ?? 15);
    const maxDomains = Number(ctx.config.max_domains_per_run ?? 3);

    const boards = await this.findBoards(maxBoards);
    let discovered = 0;
    let stored = 0;
    let duplicate = 0;
    const errors: string[] = [];

    for (const board of boards) {
      try {
        const jobs = await fetchAtsBoard(board);
        discovered += jobs.length;
        const result = await this.storeJobs(jobs, ctx.agentId);
        stored += result.stored;
        duplicate += result.duplicate;

        await query(
          `INSERT INTO discovery_known_sources (domain, source_type, jobs_found, last_seen, created_at)
           VALUES ($1, 'ats', $2, now(), now())
           ON CONFLICT (domain) DO UPDATE
             SET jobs_found = EXCLUDED.jobs_found, last_seen = now()`,
          [`${board.kind}:${board.token}`, jobs.length],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${board.kind}:${board.token}: ${message}`);
        logger.debug({ board, error: message }, "ATS board expansion failed");
      }
    }

    // Careers/sitemap discovery for domains we know but have never expanded.
    const domains = await this.findUnexpandedDomains(maxDomains);
    for (const domain of domains) {
      try {
        const harvest = await discoverFromDomainDetailed(domain);
        const sitemapLinks = await discoverFromSitemap(domain);
        const links = new Set<string>([...harvest.links, ...sitemapLinks]);
        discovered += links.size + harvest.jobs.length;

        // Structured jobs found on the careers page go straight in.
        const direct = await this.storeJobs(harvest.jobs, ctx.agentId);
        stored += direct.stored;
        duplicate += direct.duplicate;

        // Any ATS discovered on the way is fetched immediately in this run.
        for (const board of harvest.ats.slice(0, 3)) {
          try {
            const jobs = await fetchAtsBoard(board);
            discovered += jobs.length;
            const result = await this.storeJobs(jobs, ctx.agentId);
            stored += result.stored;
            duplicate += result.duplicate;
            await query(
              `INSERT INTO discovery_known_sources (domain, source_type, jobs_found, last_seen, created_at)
               VALUES ($1, 'ats', $2, now(), now())
               ON CONFLICT (domain) DO UPDATE
                 SET jobs_found = EXCLUDED.jobs_found, last_seen = now()`,
              [`${board.kind}:${board.token}`, jobs.length],
            );
          } catch (error) {
            errors.push(
              `${board.kind}:${board.token}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        for (const link of links) {
          const inserted = await query<{ id: string }>(
            `INSERT INTO discovery_search_results
                (agent_id, query, source_platform, source_url, title, snippet, fetched_at)
             VALUES ($1, $2, 'careers_page', $3, NULL, NULL, now())
             ON CONFLICT (source_url) DO NOTHING
             RETURNING id`,
            [ctx.agentId, `careers:${domain}`, link],
          );
          if (inserted.rows.length > 0) stored += 1;
          else duplicate += 1;
        }

        await query(
          `INSERT INTO discovery_known_sources (domain, source_type, jobs_found, last_seen, created_at)
           VALUES ($1, 'careers_page', $2, now(), now())
           ON CONFLICT (domain) DO UPDATE
             SET jobs_found = discovery_known_sources.jobs_found + EXCLUDED.jobs_found,
                 last_seen = now()`,
          [domain, links.size + harvest.jobs.length],
        );
      } catch (error) {
        errors.push(`${domain}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      status: stored === 0 && errors.length > 0 ? "failed" : "success",
      jobsFound: discovered,
      jobsNew: stored,
      jobsDuplicate: duplicate,
      error: errors.length > 0 ? errors.slice(0, 10).join("; ") : undefined,
      payload: { boards: boards.length, domains: domains.length },
    };
  }

  private async findBoards(limit: number): Promise<AtsBoard[]> {
    const candidates = await query<{ url: string }>(
      `SELECT source_url AS url FROM discovery_candidates
        UNION
       SELECT source_url AS url FROM discovery_search_results
        LIMIT 5000`,
    );

    const boards = new Map<string, AtsBoard>();
    for (const row of candidates.rows) {
      const board = detectAts(row.url);
      if (!board) continue;
      boards.set(`${board.kind}:${board.token}`, board);
      if (boards.size >= limit) break;
    }

    // Learned ATS boards are refreshed even when their original URLs are old.
    const learned = await query<{ domain: string }>(
      `SELECT domain FROM discovery_known_sources
        WHERE source_type = 'ats'
        ORDER BY last_seen DESC
        LIMIT $1`,
      [limit],
    );
    for (const row of learned.rows) {
      const separator = row.domain.indexOf(":");
      if (separator < 0) continue;
      const kind = row.domain.slice(0, separator);
      const token = row.domain.slice(separator + 1);
      if (!kind || !token) continue;
      if (!(kind in ATS_KIND_SET)) continue;
      boards.set(row.domain, { kind: kind as AtsKind, token });
    }

    return [...boards.values()].slice(0, limit);
  }

  private async findUnexpandedDomains(limit: number): Promise<string[]> {
    const result = await query<{ domain: string }>(
      `SELECT DISTINCT regexp_replace(source_url, '^https?://([^/]+).*$', '\\1') AS domain
         FROM discovery_candidates
        WHERE source_url IS NOT NULL
          AND source_url !~* '(greenhouse|lever|ashbyhq|workable|smartrecruiters|recruitee|myworkdayjobs|oraclecloud)\\.'
        LIMIT 500`,
    );

    const known = await query<{ domain: string }>(
      `SELECT domain FROM discovery_known_sources WHERE source_type IN ('ats', 'careers_page')`,
    );
    const knownSet = new Set(known.rows.map((row) => row.domain));

    return result.rows
      .map((row) => row.domain)
      .filter((domain) => domain && !knownSet.has(domain))
      .slice(0, limit);
  }

  private async storeJobs(
    jobs: RawJob[],
    agentId: string,
  ): Promise<{ stored: number; duplicate: number }> {
    let stored = 0;
    let duplicate = 0;

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

        await query(
          `INSERT INTO discovery_candidates
              (external_id, source_platform, source_url, title, company,
               description, location_raw, country, city, work_mode,
               employment_type, salary_min, salary_max, currency, apply_url,
               skills, posted_at, simhash, fingerprint, status,
               discovered_by_agent_id, discovered_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   $14, $15, $16, $17, $18, $19, 'pending', $20, now(), now())`,
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
            agentId,
          ],
        );
        stored += 1;
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error), url: job.url },
          "Expansion job insert failed",
        );
      }
    }

    return { stored, duplicate };
  }
}
