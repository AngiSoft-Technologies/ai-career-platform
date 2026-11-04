import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import { scrapeUrl } from "../engine/fetch.js";
import { extractJob } from "../engine/extract.js";
import {
  judgeCandidateChange,
  looksLikeClosedListing,
  type CandidateSnapshot,
} from "../engine/freshness.js";

/**
 * Page Browse & Extraction Agent.
 *
 * Uses our own engines, all running on our own infrastructure:
 *
 *   services/engine/fetch.ts    — fetch engine (SSRF guard, charset,
 *                              robots.txt, politeness, cache, PDF support)
 *   services/engine/html.ts     — HTML cleanup + Turndown markdown +
 *                              metadata + schema.org JobPosting reader
 *   services/engine/extract.ts  — deterministic extraction, then our own LLM to
 *                              fill gaps (NVIDIA / Neon AI gateway)
 */
export class BrowseAgent extends BaseDiscoveryAgent {
  readonly key = "browse_agent";
  readonly name = "Page Browse & Extraction Agent";
  readonly kind = "browse";
  readonly scheduleIntervalMinutes = 30;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const batchSize = Number(ctx.config.batch_size ?? 25);
    const useLlm = ctx.config.use_llm !== false;

    const results = await query<{
      id: string;
      source_url: string;
      query: string;
      source_platform: string | null;
    }>(
      `SELECT id, source_url, query, source_platform
         FROM discovery_search_results
        WHERE status = 'pending'
        ORDER BY fetched_at ASC
        LIMIT $1`,
      [batchSize],
    );

    if (results.rows.length === 0) {
      return {
        status: "success",
        jobsFound: 0,
        jobsNew: 0,
        jobsDuplicate: 0,
        payload: { message: "No unprocessed search results" },
      };
    }

    let totalFetched = 0;
    let totalStored = 0;
    let totalDuplicate = 0;
    let totalChanged = 0;
    let totalClosed = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    for (const row of results.rows) {
      totalFetched += 1;
      try {
        const scraped = await scrapeUrl(row.source_url, {
          onlyMainContent: true,
          preferProxy: /linkedin\.com|facebook\.com|instagram\.com/i.test(row.source_url),
        });

        if (scraped.status < 200 || scraped.status >= 400) {
          throw new Error(`HTTP ${scraped.status}`);
        }

        const job = await extractJob({
          url: scraped.finalUrl,
          markdown: scraped.markdown,
          metadata: scraped.metadata,
          jsonLd: scraped.jsonLd,
          useLlm,
        });

        const usable =
          Boolean(job.title) &&
          job.title !== "Untitled position" &&
          job.description.length >= 60;

        if (!usable) {
          // No job posting on the page. That is either a broken read or a
          // closed vacancy — only a *complete* read that says so is treated
          // as a closure, because closing a live vacancy on a bad fetch is
          // much worse than missing one closure for a cycle.
          const closed = looksLikeClosedListing(scraped.markdown, {
            complete: !scraped.looksLikeSpa,
          });
          if (!closed) {
            throw new Error("Page did not contain a job posting");
          }

          const prior = await query<{ id: string }>(
            `SELECT id FROM discovery_candidates
              WHERE source_url = $1 OR source_url = $2
              LIMIT 1`,
            [row.source_url, scraped.finalUrl],
          );
          const priorRow = prior.rows[0];
          if (priorRow) {
            await query(
              `UPDATE discovery_candidates
                  SET status = 'expired', updated_at = now()
                WHERE id = $1`,
              [priorRow.id],
            );
            await query(
              `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
               VALUES ('job.closed', 'discovery_candidate', $1, $2)`,
              [
                priorRow.id,
                JSON.stringify({
                  sourceUrl: scraped.finalUrl,
                  detectedBy: "closed_listing_phrase",
                }),
              ],
            );
            totalClosed += 1;
          }
          await query(
            `UPDATE discovery_search_results
                SET status = 'done', processed_at = now(), error = NULL
              WHERE id = $1`,
            [row.id],
          );
          continue;
        }

        const existing = await query<{
          id: string;
          title: string | null;
          company: string | null;
          description: string | null;
          salary_min: string | null;
          salary_max: string | null;
          apply_url: string | null;
        }>(
          `SELECT id, title, company, description, salary_min, salary_max, apply_url
             FROM discovery_candidates
            WHERE fingerprint = $1 OR source_url = $2
            LIMIT 1`,
          [job.fingerprint, scraped.finalUrl],
        );

        const known = existing.rows[0];
        if (known) {
          // We have seen this listing before. Decide whether anything actually
          // changed — a re-read that finds only churn must not overwrite the
          // stored record, and a re-read that finds a real edit must not be
          // filed as a duplicate.
          const previous: CandidateSnapshot = {
            title: known.title,
            company: known.company,
            description: known.description,
            salaryMin: known.salary_min === null ? null : Number(known.salary_min),
            salaryMax: known.salary_max === null ? null : Number(known.salary_max),
            applyUrl: known.apply_url,
          };
          const next: CandidateSnapshot = {
            title: job.title,
            company: job.company,
            description: job.description,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            applyUrl: job.applyUrl,
          };

          const change = await judgeCandidateChange(previous, next, {
            url: scraped.finalUrl,
            currentComplete: !scraped.looksLikeSpa,
          });

          if (change.meaningful) {
            await query(
              `UPDATE discovery_candidates
                  SET title = $2,
                      company = $3,
                      description = $4,
                      salary_min = $5,
                      salary_max = $6,
                      apply_url = $7,
                      status = CASE WHEN status = 'duplicate' THEN 'pending' ELSE status END,
                      updated_at = now()
                WHERE id = $1`,
              [
                known.id,
                job.title,
                job.company,
                job.description,
                job.salaryMin,
                job.salaryMax,
                job.applyUrl,
              ],
            );
            await query(
              `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
               VALUES ('job.changed', 'discovery_candidate', $1, $2)`,
              [
                known.id,
                JSON.stringify({
                  changedFields: change.changedFields,
                  reason: change.reason,
                  verdict: change.judgement.verdict,
                  confidence: change.judgement.confidence,
                  sourceUrl: scraped.finalUrl,
                }),
              ],
            );
            totalChanged += 1;
          } else {
            totalDuplicate += 1;
          }
        } else {
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
              row.source_platform ?? "web",
              scraped.finalUrl,
              job.title,
              job.company,
              job.description,
              job.locationRaw,
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
              job.simhash,
              job.fingerprint,
              ctx.agentId,
            ],
          );
          totalStored += 1;
        }

        await query(
          `UPDATE discovery_search_results
              SET status = 'done', processed_at = now(), error = NULL
            WHERE id = $1`,
          [row.id],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        totalFailed += 1;
        errors.push(`${row.source_url}: ${message}`);
        await query(
          `UPDATE discovery_search_results
              SET status = 'failed', processed_at = now(), error = $2
            WHERE id = $1`,
          [row.id, message.slice(0, 1_000)],
        );
        logger.debug({ url: row.source_url, error: message }, "Browse failed");
      }
    }

    return {
      status: totalFailed === totalFetched && totalStored === 0 ? "failed" : "success",
      jobsFound: totalFetched,
      jobsNew: totalStored,
      jobsDuplicate: totalDuplicate,
      error: errors.length > 0 ? errors.slice(0, 10).join("; ") : undefined,
      payload: {
        batchSize,
        processed: results.rows.length,
        failed: totalFailed,
        changed: totalChanged,
        closed: totalClosed,
        llm: useLlm,
      },
    };
  }
}
