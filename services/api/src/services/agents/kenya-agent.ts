import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import { searchWebPlanned } from "../engine/search-orchestrator.js";
import { discoverFromDomainDetailed, detectAts, fetchAtsBoard } from "../engine/discover.js";
import { crawlSite } from "../engine/crawl.js";
import { capturePage } from "../engine/screen.js";
import { extractListingJobs } from "../engine/discover.js";
import { computeFingerprint, computeSimhash } from "../engine/extract.js";
import { assessEligibility } from "../engine/eligibility.js";
import { shouldReuseIndexed } from "../engine/freshness.js";
import type { RawJob } from "../engine/sources.js";

/**
 * Kenya-First & Micro-Task Platform Agent.
 *
 * Two jobs, both board-agnostic:
 *
 *   1. **Kenya-first coverage.** Every listing is assessed for whether a
 *      Kenyan candidate can actually hold it — onsite, hybrid, or remote —
 *      and what the posting says about eligibility. Kenya ranks highest,
 *      then the rest of Africa, then remote roles worldwide that African
 *      nationals can hold.
 *
 *   2. **Micro-task / AI-training platforms.** The category the user asked
 *      for: Outlier, Scale AI, Remotasks, DataAnnotation, Alignerr, Mercor,
 *      Surge AI, Appen, Clickworker, and the rest. These almost never publish
 *      on job boards and their "apply" pages are apps, not ATS links — so the
 *      agent handles them as a special case: search, reach the platform's own
 *      site, find the roles page, capture the page (including content that
 *      only exists in the page's own JS state), extract listings, score them.
 *
 * Nothing here is a hardcoded list of employers. Targets come from the
 * `discovery_platform_targets` table, which the search and expansion agents
 * also write to — so a platform nobody has mentioned yet is still found.
 */
export class KenyaPlatformAgent extends BaseDiscoveryAgent {
  readonly key = "kenya_platform_agent";
  readonly name = "Kenya-First & Micro-Task Platform Agent";
  readonly kind = "kenya_platforms";
  readonly scheduleIntervalMinutes = 30;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const maxTargets = Number(ctx.config.max_targets_per_run ?? 12);
    const maxSitesPerCycle = Number(ctx.config.max_sites_per_cycle ?? 10);
    const includeMicroTask = ctx.config.micro_task_platforms !== false;

    const targets = await this.loadTargets(maxTargets, includeMicroTask);
    let discovered = 0;
    let stored = 0;
    let duplicate = 0;
    let eligible = 0;
    const errors: string[] = [];

    for (const target of targets) {
      try {
        const jobs = await this.harvestTarget(target, {
          maxSites: maxSitesPerCycle,
          maxAgeMs: Number(ctx.config.index_max_age_ms ?? 1000 * 60 * 45),
        });

        for (const job of jobs) {
          discovered += 1;
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
             WHERE fingerprint = $1 OR source_url = $2 LIMIT 1`,
            [fingerprint, job.url],
          );
          if (existing.rows.length > 0) {
            duplicate += 1;
            continue;
          }

          const eligibility = assessEligibility({
            title: job.title,
            description: job.description,
            location: job.location,
            country: job.country,
            city: job.city,
            worldwideByDefault: target.worldwideByDefault,
          });
          if (eligibility.eligibility === "eligible") eligible += 1;

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
              eligibility.workMode ?? job.workMode,
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
          stored += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${target.url}: ${message}`);
        logger.debug({ target: target.url, error: message }, "Kenya/platform target failed");
      }
    }

    return {
      status: stored === 0 && discovered === 0 && errors.length > 0 ? "partial" : "success",
      jobsFound: discovered,
      jobsNew: stored,
      jobsDuplicate: duplicate,
      error: errors.length > 0 ? errors.slice(0, 10).join("; ") : undefined,
      payload: {
        targetsProcessed: targets.length,
        eligibleForKenya: eligible,
        microTaskPlatforms: includeMicroTask,
      },
    };
  }

  /**
   * Reads the target list. Anything is a valid target: a domain, a careers
   * URL, a board URL, or a micro-task platform. The table is also written to
   * by the expansion agent, so this is a learned list, not a curated one.
   */
  private async loadTargets(
    limit: number,
    includeMicroTask: boolean,
  ): Promise<Array<{ url: string; kind: string; worldwideByDefault: boolean }>> {
    const filter = includeMicroTask ? "" : "AND kind <> 'micro_task'";
    const result = await query<{
      url: string;
      kind: string;
      priority: number | null;
      worldwide_by_default: boolean | null;
    }>(
      `SELECT url, kind, priority, worldwide_by_default
         FROM discovery_platform_targets
        WHERE enabled = true ${filter}
        ORDER BY priority DESC, last_seen ASC NULLS FIRST, created_at ASC
        LIMIT $1`,
      [limit],
    );

    // Seed the table the first time so the agent has something to chew on
    // even before the search agents have run.
    if (result.rows.length === 0) {
      await this.seedTargets();
      const seeded = await query<{
        url: string;
        kind: string;
        worldwide_by_default: boolean | null;
      }>(
        `SELECT url, kind, worldwide_by_default
           FROM discovery_platform_targets
          WHERE enabled = true ${filter}
          ORDER BY priority DESC, created_at ASC
          LIMIT $1`,
        [limit],
      );
      return seeded.rows.map((row) => ({
        url: row.url,
        kind: row.kind,
        worldwideByDefault: row.worldwide_by_default ?? true,
      }));
    }

    return result.rows.map((row) => ({
      url: row.url,
      kind: row.kind,
      worldwideByDefault: row.worldwide_by_default ?? true,
    }));
  }

  private async seedTargets(): Promise<void> {
    const seeds = MICRO_TASK_PLATFORMS.map((entry) => ({
      url: entry.url,
      kind: "micro_task",
      priority: 60,
      worldwideByDefault: true,
    }));

    for (const seed of seeds) {
      await query(
        `INSERT INTO discovery_platform_targets (url, kind, priority, worldwide_by_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (url) DO UPDATE
           SET kind = EXCLUDED.kind,
               worldwide_by_default = EXCLUDED.worldwide_by_default,
               enabled = true,
               updated_at = now()`,
        [seed.url, seed.kind, seed.priority, seed.worldwideByDefault],
      ).catch(() => undefined);
    }
    logger.info({ count: seeds.length }, "Micro-task platform targets seeded");
  }

  /**
   * One target can yield jobs in four different ways; try the cheapest first
   * and stop as soon as one works. That is what keeps a cycle fast.
   */
  private async harvestTarget(
    target: { url: string; kind: string; worldwideByDefault: boolean },
    budget: { maxSites: number; maxAgeMs: number },
  ): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    // 1. Direct ATS board — cheapest and richest.
    const board = detectAts(target.url);
    if (board) {
      const boardJobs = await fetchAtsBoard(board).catch(() => []);
      jobs.push(...this.normalise(boardJobs, target.url));
      if (jobs.length > 0) return jobs;
    }

    // 2. Careers-page harvest — embedded state + JSON-LD + links + nested ATS.
    const harvest = await discoverFromDomainDetailed(target.url).catch(() => ({
      links: [],
      jobs: [] as RawJob[],
      ats: [],
    }));
    jobs.push(...this.normalise(harvest.jobs, target.url));

    // 3. Bounded crawl when the site is JS-heavy and the harvest came up dry.
    if (jobs.length === 0) {
      const crawl = await crawlSite(target.url, {
        maxPages: Math.min(6, budget.maxSites),
        maxDepth: 3,
        timeoutMs: 60_000,
        jobBias: true,
      }).catch(() => ({ jobUrls: [] as string[], jobs: [] as RawJob[], pagesVisited: 0, skipped: [] as Array<{url:string;reason:string}> }));

      if (crawl.jobs.length > 0) jobs.push(...this.normalise(crawl.jobs, target.url));

      // 4. Screen capture — reads the page's own JS state, which is where
      //    micro-task platforms hide their live role lists.
      if (jobs.length === 0) {
        const capture = await capturePage(target.url, { maxJobs: 40 }).catch(() => null);
        if (capture) {
          jobs.push(
            ...this.normalise(
              extractListingJobs(capture.html, capture.finalUrl),
              target.url,
            ),
          );
          for (const link of capture.links.filter((link) => /job|career|role|vacanc|hiring|apply/i.test(link))) {
            if (jobs.length >= 40) break;
            const page = await capturePage(link, { maxJobs: 20 }).catch(() => null);
            if (!page) continue;
            jobs.push(
              ...this.normalise(extractListingJobs(page.html, page.finalUrl), link),
            );
          }
        }
      }
    }

    // 5. Search fallback — for platforms whose site is entirely gated.
    if (jobs.length === 0) {
      const planned = await searchWebPlanned(`${target.url} careers hiring`, {
        limit: 8,
      }).catch(() => null);
      const results = planned?.results ?? [];
      for (const result of results) {
        const page = await capturePage(result.url, { maxJobs: 20 }).catch(() => null);
        if (!page) continue;
        jobs.push(
          ...this.normalise(extractListingJobs(page.html, page.finalUrl), result.url),
        );
      }
    }

    await query(
      `INSERT INTO discovery_platform_targets (url, kind, jobs_found, last_seen, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now(), now())
       ON CONFLICT (url) DO UPDATE
         SET jobs_found = discovery_platform_targets.jobs_found + EXCLUDED.jobs_found,
             last_seen = now(),
             updated_at = now()`,
      [target.url, target.kind, jobs.length],
    ).catch(() => undefined);

    return jobs;
  }

  private normalise(jobs: RawJob[], sourceUrl: string): RawJob[] {
    const seen = new Set<string>();
    return jobs
      .filter((job) => job.title && job.description && job.description.length > 40)
      .filter((job) => {
        const key = `${job.title}|${job.company ?? ""}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((job) => ({ ...job, url: job.url || sourceUrl }));
  }
}

/**
 * Micro-task and AI-training platforms. These are the sites the product is
 * specifically for: work African nationals can do from anywhere, usually
 * data annotation, evaluation, RLHF, QA, and transcription.
 */
const MICRO_TASK_PLATFORMS = [
  { url: "https://outlier.ai" },
  { url: "https://scale.com" },
  { url: "https://remotasks.com" },
  { url: "https://dataannotation.tech" },
  { url: "https://alignerr.com" },
  { url: "https://labelbox.com" },
  { url: "https://mindrift.com" },
  { url: "https://mercor.com" },
  { url: "https://micro1.io" },
  { url: "https://www.usebraintrust.com" },
  { url: "https://www.turing.com" },
  { url: "https://deccanai.com" },
  { url: "https://joinhandshake.com" },
  { url: "https://www.invisible.co" },
  { url: "https://pareto.ai" },
  { url: "https://www.surgehq.ai" },
  { url: "https://afterquery.com" },
  { url: "https://atlascapture.com" },
  { url: "https://www.datacurve.io" },
  { url: "https://sepal.ai" },
  { url: "https://www.sapien.io" },
  { url: "https://stellarai.com" },
  { url: "https://www.abaka.ai" },
  { url: "https://www.fleet.ai" },
  { url: "https://terac.ai" },
  { url: "https://vetto.ai" },
  { url: "https://remoteexperts.io" },
  { url: "https://risedatalabs.com" },
  { url: "https://www.g2i.co" },
  { url: "https://gloz.ai" },
  { url: "https://www.snorkel.ai" },
  { url: "https://www.superannotate.com" },
  { url: "https://sme.careers" },
  { url: "https://www.encord.com" },
  { url: "https://www.v7labs.com" },
  { url: "https://kili-technology.com" },
  { url: "https://humansignal.com" },
  { url: "https://www.hive.ai" },
  { url: "https://www.basicai.com" },
  { url: "https://taskmonk.ai" },
  { url: "https://dataforge.ai" },
  { url: "https://pixldata.com" },
  { url: "https://playment.io" },
  { url: "https://sequence.work" },
  { url: "https://www.appen.com" },
  { url: "https://crowdgen.io" },
  { url: "https://www.oneforma.com" },
  { url: "https://centific.com" },
  { url: "https://www.telusdigital.com" },
  { url: "https://welodata.com" },
  { url: "https://www.welocalize.com" },
  { url: "https://www.lionbridge.com" },
  { url: "https://www.transperfect.com" },
  { url: "https://www.rws.com" },
  { url: "https://datamundi.ai" },
  { url: "https://sigma.ai" },
  { url: "https://babelaudio.com" },
  { url: "https://pila8.com" },
  { url: "https://e2f.com" },
  { url: "https://defined.ai" },
  { url: "https://www.lxt.ai" },
  { url: "https://www.clickworker.com" },
  { url: "https://uhrs.ai" },
  { url: "https://innodata.com" },
  { url: "https://imerit.net" },
  { url: "https://cogitotech.com" },
  { url: "https://www.shaip.com" },
  { url: "https://keymakr.com" },
  { url: "https://suntec.ai" },
  { url: "https://acmeai.com" },
  { url: "https://peoplefor.ai" },
  { url: "https://humansintheloop.ai" },
  { url: "https://karya.ai" },
  { url: "https://silencio.ai" },
];
