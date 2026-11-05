import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import {
  detectAts,
  discoverFromDomainDetailed,
  discoverFromSitemap,
  fetchAtsBoard,
  findAtsLinks,
} from "../engine/discover.js";
import type { AtsBoard, AtsKind } from "../engine/discover.js";
import { computeFingerprint, computeSimhash } from "../engine/extract.js";
import { capturePage, embeddedJobsToRaw } from "../engine/screen.js";
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
 * The host of an address.
 *
 * The remembered source is a host, so that the same employer's careers
 * page is expanded once however it was written — "https://kcbgroup.com/careers"
 * and "https://www.kcbgroup.com/" are one employer.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.trim().toLowerCase().replace(/^www\./, "");
  }
}

/**
 * Expansion Agent.
 *
 * This is the "new site appears and is hiring" answer. It does not use a list
 * of employers:
 *
 *   1. Every URL ever discovered is inspected for an ATS signature. If a
 *      company uses Greenhouse/Lever/Ashby/Workable/SmartRecruiters/Recruitee/
 *      Workday/Oracle, the agent pulls the company's whole public board.
 *   2. The sources the catalogue was given — KCB Group's careers page,
 *      Safaricom's, Kenya Airways' — are read, and the board each one
 *      points at is pulled.
 *   3. Domains that do not use an ATS are crawled: homepage → careers → job
 *      links, plus sitemap.xml.
 *   4. Boards and domains are remembered in `discovery_known_sources`, so the
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

    // A cycle has a wall-clock budget: expansion is the agent that fans out
    // over the most hosts, and one slow board must not eat the whole
    // ingestion window.
    const budgetMs = Number(ctx.config.budget_ms ?? 180_000);
    const deadline = Date.now() + budgetMs;

    const boards = await this.findBoards(maxBoards);
    let discovered = 0;
    let stored = 0;
    let duplicate = 0;
    let stoppedOnBudget = false;
    const errors: string[] = [];

    for (const board of boards) {
      if (Date.now() > deadline) {
        stoppedOnBudget = true;
        break;
      }
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

    // Careers/sitemap discovery for the employers we know but have
    // never expanded.
    const targets = await this.findUnexpandedTargets(maxDomains);
    for (const target of targets) {
      if (Date.now() > deadline) {
        stoppedOnBudget = true;
        break;
      }
      try {
        const harvest = await discoverFromDomainDetailed(target);

        // The page's own state, when the markup held nothing.
        //
        // A careers page that renders its roles in the browser ships
        // them in its state, and the board it links to is in the same
        // place. Reading that state is the only way an employer whose
        // page holds no markup is found at all — and the page has
        // already been fetched, so this costs nothing.
        let ats = harvest.ats;
        let pageJobs = harvest.jobs;
        let pageLinks = harvest.links;

        if (
          ats.length === 0 &&
          pageJobs.length === 0 &&
          pageLinks.length === 0
        ) {
          const capture = await capturePage(target, { maxJobs: 40 }).catch(
            () => null,
          );
          if (capture) {
            ats = findAtsLinks(capture.html, capture.finalUrl);
            pageJobs = embeddedJobsToRaw(
              capture.jobs,
              capture.finalUrl,
              "careers_page",
            );
            pageLinks = capture.links
              .map((href) => {
                try {
                  return new URL(href, capture.finalUrl).toString();
                } catch {
                  return null;
                }
              })
              .filter((href): href is string => Boolean(href))
              .filter((href) =>
                /job|career|role|vacanc|hiring|apply|position/i.test(href),
              );
          }
        }

        const sitemapLinks = await discoverFromSitemap(hostOf(target));
        const links = new Set<string>([...pageLinks, ...sitemapLinks]);
        discovered += links.size + pageJobs.length;

        // Structured jobs found on the careers page go straight in.
        const direct = await this.storeJobs(pageJobs, ctx.agentId);
        stored += direct.stored;
        duplicate += direct.duplicate;

        // Any ATS discovered on the way is fetched immediately in this run.
        for (const board of ats.slice(0, 3)) {
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
            [ctx.agentId, `careers:${hostOf(target)}`, link],
          );
          if (inserted.rows.length > 0) stored += 1;
          else duplicate += 1;
        }

        await query(
          `INSERT INTO discovery_known_sources (domain, source_type, jobs_found, last_seen, created_at)
           VALUES ($1, 'careers_page', $2, now(), now())
           ON CONFLICT (domain) DO UPDATE
             -- A snapshot of the last harvest, not a running total: adding
             -- the same links again every cycle made the number grow
             -- forever and made the ranking between sources meaningless.
             SET jobs_found = EXCLUDED.jobs_found,
                 last_seen = now()`,
          [hostOf(target), links.size + pageJobs.length],
        );

        // A registered source that has now been read is a source whose
        // health can be stated. It was read: the cycle knows whether it
        // answered.
        await query(
          `UPDATE job_sources
              SET last_checked_at = now(),
                  health = CASE WHEN $2 THEN 'healthy' ELSE 'degraded' END,
                  updated_at = now()
            WHERE url = $1`,
          [target, harvest.links.length + harvest.ats.length > 0],
        );
      } catch (error) {
        errors.push(`${target}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      // A board that answers 404 is a finding, not a failed cycle. The
      // cycle read every other board, recognised six hundred postings it
      // already knew and stored nothing new — that is a successful
      // cycle. It is only a failure when nothing could be read at all.
      status:
        discovered === 0 && errors.length > 0
          ? "failed"
          : errors.length > 0
            ? "partial"
            : "success",
      jobsFound: discovered,
      jobsNew: stored,
      jobsDuplicate: duplicate,
      error: errors.length > 0 ? errors.slice(0, 10).join("; ") : undefined,
      payload: {
        boards: boards.length,
        targets: targets.length,
        budgetMs,
        stoppedOnBudget,
      },
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

  /**
   * The employers to expand, and the pages to expand them from.
   *
   * Two lists, and the first one was missing.
   *
   * The registered sources are the employers the catalogue was *given*:
   * KCB Group's careers page, Safaricom's, Kenya Airways', Airtel
   * Kenya's — the ones a person put in because they want those
   * employers' roles. Nothing read them: the agent only looked at the
   * domains the *candidates* came from, so a registered source was a
   * row that sat there and was never fetched.
   *
   * The second list is the domains the candidates came from, which is
   * where the agent used to start.
   *
   * A source is expanded once: the host is remembered, and the next
   * cycle refreshes the board it led to instead of looking for it
   * again.
   */
  private async findUnexpandedTargets(limit: number): Promise<string[]> {
    const registered = await query<{ url: string }>(
      `SELECT url FROM job_sources
        WHERE type = 'company_web'
          AND url IS NOT NULL AND url <> ''
        ORDER BY last_checked_at NULLS FIRST, created_at ASC
        LIMIT 500`,
    );

    const discovered = await query<{ domain: string }>(
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

    const targets: string[] = [];
    const seenHosts = new Set<string>();

    for (const row of registered.rows) {
      const host = hostOf(row.url);
      if (!host || knownSet.has(host) || seenHosts.has(host)) continue;
      targets.push(row.url);
      seenHosts.add(host);
      if (targets.length >= limit) return targets;
    }

    for (const row of discovered.rows) {
      const host = row.domain;
      if (!host || knownSet.has(host) || seenHosts.has(host)) continue;
      targets.push(host);
      seenHosts.add(host);
      if (targets.length >= limit) break;
    }

    return targets;
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

        // The conflict on the URL is handled rather than left to fail.
        // Two agents can reach the same posting at the same time, and
        // the second insert would violate the unique constraint on the
        // URL.
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
            agentId,
          ],
        );
        if (inserted.rows.length > 0) stored += 1;
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
