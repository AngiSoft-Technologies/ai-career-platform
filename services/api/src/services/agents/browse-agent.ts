import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import { scrapeUrl } from "../engine/fetch.js";
import { extractJob, looksLikeJobPosting } from "../engine/extract.js";
import { findJobLinks } from "../engine/discover.js";
import { detectAts } from "../engine/ats.js";
import { DEFAULT_MAX_QUEUE_DEPTH, queueRoom } from "../engine/queue.js";
import {
  hostIsQuiet,
  noteLoudHost,
  noteQuietHost,
  reserveDailyQuota,
} from "../engine/quota.js";
import {
  isUnreadableRedirectWrapper,
  unwrapSearchRedirect,
} from "../engine/redirect.js";
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

  /** How many postings one listing page may contribute. Set per run. */
  private maxExpandedLinks = 15;

  /** How many more pages the queue may take. Set per run. */
  private queueRoom = 0;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const batchSize = Number(ctx.config.batch_size ?? 25);
    const useLlm = ctx.config.use_llm !== false;

    // A cycle has a wall-clock budget.
    //
    // The browse agent is the most scrape-heavy thing we run, and a cycle
    // without a deadline is a cycle that can outlive the job that started
    // it: the job's own deadline cannot fire while a page is being read,
    // and the pages are the part that can take minutes. The budget is the
    // agent's own promise to stop taking on work, so the job deadline stays
    // a backstop rather than the primary control.
    const budgetMs = Number(ctx.config.budget_ms ?? 300_000);
    // One page gets one deadline. A page that cannot be read in this time
    // is a page we do not have time for.
    const pageTimeoutMs = Number(ctx.config.page_timeout_ms ?? 30_000);

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

    const deadline = Date.now() + budgetMs;

    let totalFetched = 0;
    let totalStored = 0;
    let totalDuplicate = 0;
    let totalChanged = 0;
    let totalClosed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalExpanded = 0;
    let stoppedOnBudget = false;
    const errors: string[] = [];

    // How many postings one listing page may contribute. A listing can
    // hold hundreds; the queue drains at a few dozen a cycle, so a page
    // that names more than this would push everything else out of reach.
    this.maxExpandedLinks = Number(ctx.config.max_expanded_links ?? 15);

    // The room left in the queue.
    //
    // A cycle of listing expansion can put six hundred rows into a
    // queue that drains at eighty pages an hour, so the queue grew
    // faster than it drained and a vacancy found today was read next
    // week. The queue has a depth now: what is in it is read, and what
    // would make it longer waits.
    const maxQueueDepth = Number(
      ctx.config.max_queue_depth ?? DEFAULT_MAX_QUEUE_DEPTH,
    );
    this.queueRoom = await queueRoom(maxQueueDepth);

    for (const row of results.rows) {
      if (Date.now() > deadline) {
        // The rest of the batch stays pending; the next cycle picks it up.
        stoppedOnBudget = true;
        break;
      }

      totalFetched += 1;

      // The host is known before the read, so that a failure can be
      // counted against the host that caused it.
      const host = (() => {
        try {
          return new URL(unwrapSearchRedirect(row.source_url)).host;
        } catch {
          return "unknown";
        }
      })();

      try {
        // A search-engine click-through wrapper is a redirect *page*, not a
        // redirect: reading it returns a notice rather than the listing.
        // The destination is decoded here, and a wrapper that cannot be
        // decoded is dropped rather than crawled.
        const target = unwrapSearchRedirect(row.source_url);
        if (isUnreadableRedirectWrapper(target)) {
          totalSkipped += 1;
          await query(
            `UPDATE discovery_search_results
                SET status = 'failed', processed_at = now(),
                    error = $2
              WHERE id = $1`,
            [row.id, "REDIRECT_WRAPPER"],
          );
          continue;
        }

        // A board's address is not a posting, and it is not a page of
        // postings either: the board renders its list in the browser,
        // so the page holds no links and no text.
        //
        // The expansion agent reads boards through their own endpoint,
        // which is the whole list in one request. Reading the board's
        // page here would spend a request to learn nothing.
        const board = detectAts(target);
        if (board) {
          totalSkipped += 1;
          await query(
            `UPDATE discovery_search_results
                SET status = 'done', processed_at = now(),
                    error = $2
              WHERE id = $1`,
            [row.id, "ATS_BOARD"],
          );
          continue;
        }

        // Per-host page budget. The browse agent is the most scrape-heavy
        // thing we run, and a single pathological domain must not spend the
        // whole day's budget.
        //
        // A host that has had nothing to say, three times running, is
        // not read again for an hour.
        //
        // The queue held four hundred and sixty-three pages from one
        // site — one per category — and every one of them was a request
        // spent to be told that the site had nothing. The host is read
        // three times now, and then not at all.
        if (await hostIsQuiet(host)) {
          totalSkipped += 1;
          await query(
            `UPDATE discovery_search_results
                SET status = 'failed', processed_at = now(),
                    error = $2
              WHERE id = $1`,
            [row.id, "HOST_QUIET"],
          );
          continue;
        }

        const reservation = await reserveDailyQuota(
          "scrape",
          host,
          1,
          Number(config.DISCOVERY_DAILY_QUOTA ?? 0) || 1_000,
        );
        if (!reservation.ok) {
          totalSkipped += 1;
          await query(
            `UPDATE discovery_search_results
                SET status = 'failed', processed_at = now(),
                    error = $2
              WHERE id = $1`,
            [row.id, "HOST_QUOTA_EXCEEDED"],
          );
          continue;
        }

        const scraped = await scrapeUrl(target, {
          onlyMainContent: true,
          timeoutMs: pageTimeoutMs,
          preferProxy: /linkedin\.com|facebook\.com|instagram\.com/i.test(target),
        });

        if (scraped.status < 200 || scraped.status >= 400) {
          throw new Error(`HTTP ${scraped.status}`);
        }

        // Is this a posting, or a page of postings?
        //
        // The answer decides everything that follows: whether a model is
        // asked to fill the gaps, and whether the page is worth mining
        // for the postings inside it. It is answered from the page
        // itself rather than from the title the search engine gave,
        // because the title is wrong often enough to matter — a posting
        // whose board is called "Jobs in Kenya", a listing whose title
        // names a role.
        const postingLike = looksLikeJobPosting(scraped.markdown, {
          jsonLd: scraped.jsonLd,
          url: scraped.finalUrl,
        });

        // A page that looks like a posting is read as one. A page that
        // does not is not asked of a model: the model is the expensive
        // part of the read, and there is nothing on the page for it to
        // extract.
        const job = postingLike
          ? await extractJob({
              url: scraped.finalUrl,
              markdown: scraped.markdown,
              metadata: scraped.metadata,
              jsonLd: scraped.jsonLd,
              useLlm,
            })
          : null;

        const usable =
          job !== null &&
          Boolean(job.title) &&
          job.title !== "Untitled position" &&
          // A title and sixty characters of text is a page, not a job
          // posting. Without this the catalogue fills up with whatever
          // the search engine happened to rank.
          job.description.length >= 60;

        // A host that answers with a posting is a host worth reading.
        if (usable) await noteLoudHost(host);

        if (!usable) {
          // Not a posting. It may still be a page of them.
          //
          // Almost every job query is answered with listings — "Legal
          // Jobs in Kenya (97 Open Roles)", "Legal Jobs in Kenya
          // November 2026" — and those pages are where the postings
          // actually are. Read as postings they yield nothing, and the
          // read is wasted; read as listings they yield a dozen URLs.
          //
          // The backlog was 700-odd such pages, and every one of them
          // was being read as a posting and failing.
          const expanded = await this.expandListing(
            scraped.html,
            scraped.finalUrl,
            row.query,
            ctx.agentId,
          );

          if (expanded.links > 0) {
            // It is a listing. It is done — whether its postings were
            // new or already known, the page has been read and what it
            // had to give has been queued.
            totalExpanded += expanded.queued;

            if (expanded.deferred) {
              // The queue was full, so the postings the page names did
              // not all fit into it. The page is not done: it goes to
              // the back of the queue and is read again when there is
              // room, and the postings it names are not lost.
              await query(
                `UPDATE discovery_search_results
                    SET fetched_at = now()
                  WHERE id = $1`,
                [row.id],
              );
              continue;
            }

            await query(
              `UPDATE discovery_search_results
                  SET status = 'done', processed_at = now(), error = NULL
                WHERE id = $1`,
              [row.id],
            );
            continue;
          }

          // No job posting on the page, and no postings inside it.
          // That is either a broken read or a closed vacancy — only a
          // *complete* read that says so is treated as a closure,
          // because closing a live vacancy on a bad fetch is much
          // worse than missing one closure for a cycle.
          const closed = looksLikeClosedListing(scraped.markdown, {
            complete: !scraped.looksLikeSpa,
          });
          if (!closed) {
            // The host said nothing. Three of those and the host is
            // left alone for an hour.
            await noteQuietHost(host);
            throw new Error("Page did not contain a job posting");
          }

          const prior = await query<{ id: string }>(
            `SELECT id FROM discovery_candidates
              WHERE source_url = $1 OR source_url = $2
              LIMIT 1`,
            [target, scraped.finalUrl],
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

        // The page is a posting, and the extraction produced one.
        if (!job) continue;

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
          // The candidate is inserted with the conflict handled rather
          // than left to fail. Two agents can be handed the same URL —
          // the queue is read without a lock, and eleven machines run
          // the browse cycle — and the second insert would violate the
          // unique constraint on the URL, which failed the whole row
          // and marked the search result as broken. The posting was
          // found; it was simply already there.
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
          if (inserted.rows.length > 0) totalStored += 1;
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

        // A host that refuses us — a robots file that says no, an
        // address that will not resolve — is a host that has nothing to
        // give. Three of those and it is left alone for an hour.
        if (
          /ROBOTS_DISALLOWED|WATERFALL_EXHAUSTED|fetch failed|ENOTFOUND/i.test(
            message,
          )
        ) {
          await noteQuietHost(host);
        }

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
        skipped: totalSkipped,
        // The postings found inside the pages of postings.
        expanded: totalExpanded,
        llm: useLlm,
        budgetMs,
        stoppedOnBudget,
      },
    };
  }

  /**
   * Mines a page of postings for the postings inside it.
   *
   * The links are queued, not read: a listing can hold fifty postings
   * and the browse agent has a budget of twenty pages a cycle. So the
   * listing costs one read and the postings it names are read over the
   * cycles that follow.
   *
   * The cap is on the number of links taken from one page. A board that
   * publishes five hundred openings would otherwise put five hundred
   * rows in a queue that drains at forty a day, and the postings behind
   * the first five hundred would never be reached.
   *
   * The second cap is the queue itself. A cycle of listing expansion
   * can put six hundred rows into a queue that drains at eighty pages
   * an hour, so the queue grew faster than it drained and the postings
   * at the back were read a week later, by which time they had closed.
   * When the queue is full the postings that do not fit are not lost:
   * the page is read again later, when there is room for them.
   *
   * The two counts are different on purpose. `links` says the page was
   * a listing — which is true whether the postings on it are new or
   * already known — and `queued` says how many of them were new.
   */
  private async expandListing(
    html: string,
    baseUrl: string,
    queryLabel: string,
    agentId: string,
  ): Promise<{ links: number; queued: number; deferred: boolean }> {
    const links = findJobLinks(html, baseUrl, this.maxExpandedLinks).filter(
      (link) => !samePage(link, baseUrl),
    );
    if (links.length === 0) return { links: 0, queued: 0, deferred: false };

    // Only what fits in the queue is queued.
    //
    // A link that is already in the queue does not take room: the
    // postings the page names are read over the cycles that follow,
    // and a page read twice must make progress on the second read.
    const room = Math.max(0, this.queueRoom);
    let queued = 0;
    let deferred = false;

    for (const link of links) {
      if (queued >= room) {
        // The queue is full. The rest of the page's postings are not
        // lost: the page is read again when there is room for them.
        deferred = true;
        break;
      }

      try {
        const inserted = await query<{ id: string }>(
          `INSERT INTO discovery_search_results
              (agent_id, query, source_platform, source_url, title, snippet, fetched_at)
           VALUES ($1, $2, 'listing_link', $3, NULL, NULL, now())
           ON CONFLICT (source_url) DO NOTHING
           RETURNING id`,
          [agentId, queryLabel, link],
        );
        if (inserted.rows.length > 0) queued += 1;
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error), link },
          "Listing expansion: link insert failed",
        );
      }
    }

    this.queueRoom = Math.max(0, this.queueRoom - queued);

    return { links: links.length, queued, deferred };
  }
}

/** True when two URLs are the same page. */
function samePage(left: string, right: string): boolean {
  const strip = (value: string): string => {
    try {
      const url = new URL(value);
      url.hash = "";
      const path = url.pathname.replace(/\/+$/, "");
      return `${url.origin}${path}${url.search}`;
    } catch {
      return value;
    }
  };
  return strip(left) === strip(right);
}
