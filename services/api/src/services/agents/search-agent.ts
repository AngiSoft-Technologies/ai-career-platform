import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import {
  jobDiscoveryGate,
  searchWebPlannedAll,
} from "../engine/search-orchestrator.js";
import { buildBoardQueries, buildDiscoveryQueries, type QuerySeeds } from "../engine/discover.js";
import { boardKey, detectAts, type AtsBoard } from "../engine/ats.js";
import { pooled } from "../engine/index.js";
import { cleanJobTitle, isListingTitle } from "../engine/extract.js";
import { jobUrlRefusal } from "../engine/job-url.js";
import { DEFAULT_MAX_QUEUE_DEPTH, queueRoom } from "../engine/queue.js";

/**
 * The search engine discovery agent.
 *
 * Uses our own search stack (`services/engine/search.ts`): the DuckDuckGo HTML
 * client with pagination and anti-bot retries, the multi-instance SearXNG
 * client, and Bing's RSS and HTML interfaces — all over our own egress.
 *
 * Queries are NOT a fixed list. Every run rebuilds them from:
 *   • what users actually want (desired roles, skills, preferred countries)
 *   • the profession taxonomy
 *   • domains learned by previous runs and the expansion agent
 *   • exploration queries that force brand-new domains to surface
 *
 * Results become `discovery_search_results` rows, which the browse agent reads
 * next. The whole run is bounded by a wall-clock budget so a rate-limited
 * engine can never stall the rest of the discovery cycle.
 */

/**
 * Rewrites a domain query into one the engines understand.
 *
 * The agent configuration carries domain queries as `careers:<domain>`,
 * which is a label the expansion agent uses for its own bookkeeping — it
 * is not a search operator, and no engine understands it. Sent as it
 * stands, "careers:remoteOK.com" is a phrase that matches nothing, and
 * seven of the twelve queries in one cycle were of this shape.
 *
 * The search operator that *is* understood is `site:`, so that is what a
 * domain query becomes.
 */
export function normaliseConfiguredQuery(query: string): string {
  const trimmed = query.trim();
  const domain = /^careers:\s*(\S+)$/i.exec(trimmed);
  if (!domain?.[1]) return trimmed;

  const host = domain[1]
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "");
  return host ? `site:${host} jobs` : trimmed;
}

export class SearchEngineAgent extends BaseDiscoveryAgent {
  readonly key = "search_engine_agent";
  readonly name = "Search Engine Discovery Agent";
  readonly kind = "search_engine";
  readonly scheduleIntervalMinutes = 60;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const maxResultsPerQuery = Number(ctx.config.max_results_per_query ?? 8);
    const country = String(ctx.config.country ?? "ke");
    // Freshness is off unless it is asked for. A job posting is not
    // news: it stays open for weeks and often for months, and a date
    // filter removes postings that are still hiring. One query in eight
    // returned *nothing at all* with a one-month filter and six results
    // without it — the filter was costing the run more than it bought.
    const freshness =
      ctx.config.freshness === "day" ||
      ctx.config.freshness === "week" ||
      ctx.config.freshness === "month" ||
      ctx.config.freshness === "year"
        ? ctx.config.freshness
        : undefined;

    const seeds = await this.loadSeeds();
    const generated = buildDiscoveryQueries(seeds);
    const boardQueries = buildBoardQueries(seeds);

    // Operators can pin extra queries in the agent config; they are additive,
    // never a replacement for generated discovery.
    const configured = Array.isArray(ctx.config.queries)
      ? (ctx.config.queries as unknown[])
          .filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
          .map(normaliseConfiguredQuery)
      : [];

    // A cycle has a budget. A modest cap keeps the whole run inside a few
    // minutes even when engines rate-limit us; the next cycle builds
    // different queries, so coverage keeps expanding.
    const maxQueries = Number(ctx.config.max_queries_per_run ?? 12);
    const concurrency = Number(ctx.config.concurrency ?? 4);
    const budgetMs = Number(ctx.config.budget_ms ?? 150_000);

    // The pinned queries are a fixed list, and the generated ones rotate
    // with the taxonomy and the learned sources. If the pinned list is
    // given the whole budget, the rotation never runs — which is the
    // opposite of what a discovery agent is for. Half the budget goes to
    // each, so a cycle always explores and always honours the operator's
    // own queries.
    const pinnedQuota = Math.min(
      configured.length,
      Math.max(1, Math.floor(maxQueries / 2)),
    );
    // The pinned list is longer than the budget, so it is read from a
    // window that moves with the hour. Over a day every pinned query is
    // used, and the ones outside the window wait their turn rather than
    // being crowded out for good.
    const offset =
      configured.length > pinnedQuota
        ? (new Date().getUTCHours() * pinnedQuota) % configured.length
        : 0;
    const pinned = [
      ...configured.slice(offset, offset + pinnedQuota),
      ...configured.slice(
        0,
        Math.max(0, pinnedQuota - (configured.length - offset)),
      ),
    ];

    // The board queries have a share of their own.
    //
    // A board's answer is worth more than a posting's: one address is
    // the employer's whole list, read in one request. They are a third
    // of the discovery effort rather than a part of the role queries,
    // because the role queries would otherwise fill the budget with
    // postings one at a time.
    //
    // The list is longer than the share, so it is read from a window
    // that moves with the hour: over a day every board query is used.
    const boardQuota = Math.max(
      1,
      Math.min(
        boardQueries.length,
        Math.floor(maxQueries / 6) || 1,
      ),
    );
    const boardOffset =
      boardQueries.length > boardQuota
        ? (new Date().getUTCHours() * boardQuota) % boardQueries.length
        : 0;
    const boards = [
      ...boardQueries.slice(boardOffset, boardOffset + boardQuota),
      ...boardQueries.slice(
        0,
        Math.max(0, boardQuota - (boardQueries.length - boardOffset)),
      ),
    ];

    const queries = [...new Set([...pinned, ...boards, ...generated])].slice(
      0,
      Math.max(1, maxQueries),
    );

    const started = Date.now();
    const deadline = started + budgetMs;

    let totalFetched = 0;
    let totalStored = 0;
    let totalDuplicate = 0;
    let totalNotAJob = 0;
    let totalListings = 0;
    let totalDeferred = 0;
    let totalBoards = 0;
    let timedOut = false;
    const errors: string[] = [];
    const engines = new Set<string>();

    // How many URLs one run may add to the queue.
    //
    // The browse agent reads twenty pages every half hour, so a hundred
    // URLs an hour is more than the pipeline can read. Adding more than
    // that does not find more jobs — it only makes the queue longer, and
    // the URLs behind the backlog are read later and are staler when they
    // are read.
    const maxQueuePerRun = Number(ctx.config.max_queue_per_run ?? 60);

    // The room left in the queue of pages waiting to be read.
    const maxQueueDepth = Number(
      ctx.config.max_queue_depth ?? DEFAULT_MAX_QUEUE_DEPTH,
    );
    let room = await queueRoom(maxQueueDepth);

    const settle = await pooled(
      queries,
      concurrency,
      async (queryText) => {
        // Stop starting new work once the budget is spent; in-flight ones
        // still finish and are counted.
        if (Date.now() > deadline) {
          timedOut = true;
          return null;
        }

        try {
          const remaining = Math.max(5_000, deadline - Date.now());
          // searchWebPlanned over-fetches, plans operators, enforces them
          // locally and renumbers positions — the plain searchWeb chain only
          // picks a provider.
          //
          // The recall-first variant is used here, and it fans out to every
          // engine that can serve a posting. The strict chain stops at the
          // first engine that answers, and one blocked engine was enough to
          // end a query with nothing: DuckDuckGo answers with an anti-bot
          // page, Bing's HTML result page sometimes answers a different
          // question, and the public SearXNG instances answer about half
          // the time. A discovery run that found one job in twelve queries
          // was the result of three providers failing on the same morning.
          //
          // The news engine is left out on purpose: its results are
          // articles behind a wrapper, never a posting, so asking it
          // costs a request and returns nothing the gate would keep.
          const planned = await searchWebPlannedAll(queryText, {
            limit: maxResultsPerQuery,
            country,
            freshness,
            timeoutMs: Math.min(remaining, 45_000),
            providers: ["searxng", "duckduckgo", "bing"],
            // The gate that keeps a news engine from shadowing the web
            // engines, keeps the queue free of pages that are not about
            // a role, and drops the results an engine answered with
            // when it was asked a different question.
            isValidResult: jobDiscoveryGate(queryText),
          });
          return { queryText, results: planned.results };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.debug({ query: queryText, error: message }, "Search query failed");
          errors.push(`Search failed for "${queryText}": ${message}`);
          return null;
        }
      },
    );

    for (const result of settle) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { queryText, results } = result.value;
      totalFetched += results.length;

      for (const result of results) {
        engines.add(result.engine);

        // A board's address is learned, not queued.
        //
        // The address is the employer's whole list of postings, and the
        // expansion agent reads boards properly — through the board's
        // own endpoint, with the employer's name taken from the board's
        // own page. Queuing the address for the browse agent would
        // spend a page read on a page that holds no posting, because
        // the board renders its list in the browser.
        //
        // Oracle's boards are the clearest case: the address is a
        // tenant id and a site id, and the employer's name is only on
        // the board's page. A search for "hcmUI/CandidateExperience"
        // finds Central Bank of Kenya's board and KCB Group's; without
        // this, both were dropped — the title of a board names no role.
        const board = detectAts(result.url);
        if (board) {
          const learned = await this.learnBoard(board);
          if (learned) totalBoards += 1;
          else totalDuplicate += 1;
          continue;
        }

        // The title is checked before the URL is queued.
        //
        // The browse agent reads a page to find out what it is, and a
        // page read is the expensive part of the pipeline. A
        // search-engine result carries its title, and the title of a
        // page that is not about a role says so: "What is ERP?",
        // "Krita | Creative Freedom for Digital Artists", "New Honda
        // Ridgeline for Sale". Queueing those spends a request on a
        // page we already know we will refuse, and the queue of unread
        // URLs grew faster than the browse agent could drain it.
        //
        // A *listing* is queued as well, and it is the other half of
        // the answer: "Legal Jobs in Kenya (97 Open Roles)" is not a
        // posting, but it is the page the postings are on. The browse
        // agent reads it, finds no posting in it and mines it for the
        // postings it names.
        const title = cleanJobTitle(result.title);
        const listing = isListingTitle(result.title);
        if (!title && !listing) {
          totalNotAJob += 1;
          continue;
        }
        if (listing) totalListings += 1;

        // The address itself is a question too. A search engine will
        // answer a query for a role with an Amazon help page, a
        // LinkedIn sign-in wall and an examination board's news page,
        // and each of those is a request spent to be refused.
        const refusal = jobUrlRefusal(result.url);
        if (refusal) {
          totalNotAJob += 1;
          continue;
        }

        // The queue is bounded. Beyond the bound the results are
        // dropped for this run and the next run finds them again.
        if (totalStored >= maxQueuePerRun) {
          totalDeferred += 1;
          continue;
        }

        // The queue is bounded by its own length too.
        //
        // The per-run bound is sixty, but the browse agent adds hundreds
        // of rows to the same queue when it mines a listing, so the
        // queue's length is the bound that matters. A result that does
        // not fit waits for the next run — and the next run finds it
        // again, because the engines answer the same question.
        if (room <= 0) {
          totalDeferred += 1;
          continue;
        }

        try {
          // The unique index on source_url makes this an upsert: a URL we have
          // already seen is not re-queued.
          const inserted = await query<{ id: string }>(
            `INSERT INTO discovery_search_results
                (agent_id, query, source_platform, source_url, title, snippet, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (source_url) DO NOTHING
             RETURNING id`,
            [
              ctx.agentId,
              queryText,
              result.engine,
              result.url,
              result.title.slice(0, 500),
              result.description.slice(0, 1_500),
            ],
          );
          if (inserted.rows.length > 0) {
            totalStored += 1;
            room -= 1;
          } else totalDuplicate += 1;
        } catch (insertError) {
          errors.push(
            `Insert failed for ${result.url}: ${
              insertError instanceof Error ? insertError.message : String(insertError)
            }`,
          );
        }
      }
    }

    // Record which engines actually returned data so the learning agent can
    // deprioritise blocked ones on this host.
    for (const engine of engines) {
      await query(
        `INSERT INTO discovery_source_quality (source_platform, total_jobs, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (source_platform) DO UPDATE
           SET total_jobs = discovery_source_quality.total_jobs + EXCLUDED.total_jobs,
               updated_at = now()`,
        [engine, totalStored],
      ).catch(() => undefined);
    }

    return {
      status: errors.length > 0 && totalStored === 0 ? "failed" : "success",
      jobsFound: totalFetched,
      jobsNew: totalStored,
      jobsDuplicate: totalDuplicate,
      error: errors.length > 0 ? errors.slice(0, 10).join("; ") : undefined,
      payload: {
        queriesProcessed: queries.length,
        elapsedMs: Date.now() - started,
        budgetExceeded: timedOut,
        engines: [...engines],
        seedRoles: seeds.roles.slice(0, 10),
        seedCountries: seeds.countries,
        // Results whose title said plainly that they are not about a
        // role. They were never queued, so they cost nothing.
        notAJobTitle: totalNotAJob,
        // Results that named a page of postings rather than a posting.
        listings: totalListings,
        // Boards learned — the employer's whole list of postings, read
        // by the expansion agent.
        boards: totalBoards,
        // Results found but not queued, because the queue was full.
        deferred: totalDeferred,
      },
    };
  }

  /**
   * Remembers a board so the expansion agent reads it.
   *
   * A board that has never been read is remembered with no time on it,
   * and the expansion agent reads those first: a board that is new is
   * worth more than one that was read yesterday.
   *
   * A board that is already known is left exactly as it is. Its time is
   * when it was *read*, and bumping it here would push the board to the
   * back of the rotation every cycle it appeared in a search result —
   * and a board that is always at the back is never read.
   */
  private async learnBoard(board: AtsBoard): Promise<boolean> {
    const inserted = await query<{ domain: string }>(
      `INSERT INTO discovery_known_sources
           (domain, source_type, jobs_found, last_seen, created_at)
       VALUES ($1, 'ats', 0, NULL, now())
       ON CONFLICT (domain) DO NOTHING
       RETURNING domain`,
      [boardKey(board)],
    ).catch(() => ({ rows: [] as Array<{ domain: string }> }));

    return inserted.rows.length > 0;
  }

  /**
   * Seeds come from live product data. If nobody has a profile yet we fall
   * back to the profession taxonomy, which is itself data-driven.
   */
  private async loadSeeds(): Promise<QuerySeeds> {
    const roles = new Set<string>();
    const skills = new Set<string>();
    const countries = new Set<string>();

    try {
      const profiles = await query<{
        desired_roles: string[] | null;
        country: string | null;
        preferred_countries: string[] | null;
      }>(
        `SELECT desired_roles, country, preferred_countries
           FROM candidate_profiles
          ORDER BY updated_at DESC
          LIMIT 200`,
      );
      for (const row of profiles.rows) {
        for (const role of row.desired_roles ?? []) roles.add(role);
        if (row.country) countries.add(row.country);
        for (const country of row.preferred_countries ?? []) countries.add(country);
      }
    } catch (error) {
      logger.debug({ error }, "Search seeds: candidate profiles unavailable");
    }

    try {
      const profileSkills = await query<{ name: string }>(
        `SELECT s.name
           FROM candidate_skills s
           JOIN candidate_profiles p ON p.id = s.profile_id
          ORDER BY p.updated_at DESC
          LIMIT 300`,
      );
      for (const row of profileSkills.rows) skills.add(row.name);
    } catch (error) {
      logger.debug({ error }, "Search seeds: candidate skills unavailable");
    }

    try {
      const preferences = await query<{
        preferred_roles: string[] | null;
        preferred_countries: string[] | null;
      }>(
        `SELECT preferred_roles, preferred_countries
           FROM candidate_preferences
          ORDER BY updated_at DESC
          LIMIT 200`,
      );
      for (const row of preferences.rows) {
        for (const role of row.preferred_roles ?? []) roles.add(role);
        for (const country of row.preferred_countries ?? []) countries.add(country);
      }
    } catch (error) {
      logger.debug({ error }, "Search seeds: preferences unavailable");
    }

    try {
      const taxonomy = await query<{ name: string; slug: string }>(
        `SELECT name, slug FROM profession_taxonomy ORDER BY random() LIMIT 12`,
      );
      for (const row of taxonomy.rows) {
        roles.add(row.name);
        if (row.slug) skills.add(row.slug.replace(/-/g, " "));
      }
    } catch (error) {
      logger.debug({ error }, "Search seeds: profession taxonomy unavailable");
    }

    const known = await query<{ domain: string }>(
      `SELECT domain FROM discovery_known_sources
        WHERE source_type IN ('ats', 'careers_page')
        ORDER BY jobs_found DESC, last_seen DESC
        LIMIT 40`,
    ).catch(() => ({ rows: [] as Array<{ domain: string }> }));

    return {
      roles: [...roles].slice(0, 12),
      skills: [...skills].slice(0, 10),
      countries: [...countries].slice(0, 6),
      knownDomains: known.rows
        .map((row) => row.domain)
        .filter((domain) => !domain.includes(":")),
    };
  }
}
