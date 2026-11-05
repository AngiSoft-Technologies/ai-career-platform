import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import {
  isJobDiscoveryResult,
  searchWebPlanned,
} from "../engine/search-orchestrator.js";
import { buildDiscoveryQueries, type QuerySeeds } from "../engine/discover.js";
import { pooled } from "../engine/index.js";
import { cleanJobTitle } from "../engine/extract.js";

/**
 * Search Engine Discovery Agent.
 *
 * Uses our own search stack (`services/engine/search.ts`): the DuckDuckGo HTML
 * client with pagination and anti-bot retries, the multi-instance SearXNG
 * client, and a Bing HTML fallback — all over our own egress.
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
export class SearchEngineAgent extends BaseDiscoveryAgent {
  readonly key = "search_engine_agent";
  readonly name = "Search Engine Discovery Agent";
  readonly kind = "search_engine";
  readonly scheduleIntervalMinutes = 60;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const maxResultsPerQuery = Number(ctx.config.max_results_per_query ?? 8);
    const country = String(ctx.config.country ?? "ke");
    const freshness =
      ctx.config.freshness === "day" ||
      ctx.config.freshness === "week" ||
      ctx.config.freshness === "month" ||
      ctx.config.freshness === "year"
        ? ctx.config.freshness
        : "week";

    const seeds = await this.loadSeeds();
    const generated = buildDiscoveryQueries(seeds);

    // Operators can pin extra queries in the agent config; they are additive,
    // never a replacement for generated discovery.
    const configured = Array.isArray(ctx.config.queries)
      ? (ctx.config.queries as unknown[]).filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : [];

    // A cycle has a budget. A modest cap keeps the whole run inside a few
    // minutes even when engines rate-limit us; the next cycle builds
    // different queries, so coverage keeps expanding.
    const maxQueries = Number(ctx.config.max_queries_per_run ?? 12);
    const concurrency = Number(ctx.config.concurrency ?? 4);
    const budgetMs = Number(ctx.config.budget_ms ?? 150_000);

    const queries = [...new Set([...configured, ...generated])].slice(
      0,
      Math.max(1, maxQueries),
    );

    const started = Date.now();
    const deadline = started + budgetMs;

    let totalFetched = 0;
    let totalStored = 0;
    let totalDuplicate = 0;
    let totalNotAJob = 0;
    let timedOut = false;
    const errors: string[] = [];
    const engines = new Set<string>();

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
          const planned = await searchWebPlanned(queryText, {
            limit: maxResultsPerQuery,
            country,
            freshness,
            timeoutMs: Math.min(remaining, 45_000),
            // The gate that keeps a news engine from shadowing the web
            // engines, and keeps the queue free of pages that are not
            // about a role.
            isValidResult: isJobDiscoveryResult,
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

        // The title is checked before the URL is queued.
        //
        // The browse agent reads a page to find out whether it is a job
        // posting, and a page read is the expensive part of the
        // pipeline. A search-engine result carries its title, and the
        // title of a page that is not about a role says so: "What is
        // ERP?", "Krita | Creative Freedom for Digital Artists", "New
        // Honda Ridgeline for Sale". Queueing those spends a request on
        // a page we already know we will refuse, and the queue of
        // unread URLs grew faster than the browse agent could drain it.
        //
        // The same rule the extractor applies is applied here, so a
        // title that is refused at search time is also refused at
        // browse time.
        if (!cleanJobTitle(result.title)) {
          totalNotAJob += 1;
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
          if (inserted.rows.length > 0) totalStored += 1;
          else totalDuplicate += 1;
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
      },
    };
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
