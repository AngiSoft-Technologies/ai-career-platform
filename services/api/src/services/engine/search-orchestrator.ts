/**
 * Search orchestration — plan, over-fetch, enforce, renumber.
 *
 * The provider chain (see `search.ts`) answers one question: "find URLs for
 * this query". This module answers the harder ones:
 *
 *  1. **Over-fetch.** We ask for 2× the limit (5× when operators had to be
 *     relaxed and enforced locally, capped at 100), because local filtering
 *     discards results and we still owe the caller their `limit`.
 *  2. **Operator planning.** `site:`/`-site:`/`inurl:`/`intitle:` are split
 *     into what the provider honours and what we enforce ourselves.
 *  3. **Category and domain filters** are baked into the provider query *and*
 *     re-checked locally, because backends drop them silently.
 *  4. **Position integrity.** Positions are renumbered after every filter,
 *     and only when the list actually changed.
 *  5. **Category attribution** stamps each result so analytics and feedback
 *     match what the client saw.
 */

import { logger } from "../../logger.js";
import { sampled } from "../../lib/rollout.js";
import { searchWeb, type SearchOptions, type WebSearchResult } from "./search.js";
import { cleanJobTitle } from "./job-title.js";
import { isNewsRedirectWrapper } from "./redirect.js";
import {
  buildCategoryQuery,
  buildDomainQuery,
  getCategoryFromUrl,
  keepOperatorMatches,
  matchesDomainLists,
  planOperatorQuery,
  type QueryPlan,
  type SearchCategory,
} from "./search-operators.js";

export interface PlannedSearchOptions extends SearchOptions {
  categories?: SearchCategory[];
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Cohort key for deterministic experiment bucketing (per-tenant, per-request). */
  cohortKey?: string;
  /** Override the default over-fetch multiplier (normally derived from the plan). */
  overfetchMultiplier?: number;
}

export interface PlannedSearchResult {
  results: WebSearchResult[];
  /** Final count, summed from the *filtered* response. */
  totalCount: number;
  /** Results dropped by local enforcement. */
  dropped: number;
  plan: QueryPlan;
  providerQuery: string;
  overfetchLimit: number;
}

const MAX_OVERFETCH = 100;

/**
 * The validity gate for job discovery.
 *
 * Two things make a search result useless for finding a job:
 *
 *   1. It is a *news* headline. Google News RSS returns an article
 *      about a job, not the job, behind a wrapper that cannot be
 *      decoded. The browse agent read these for days and never
 *      produced a single candidate from them — and because the chain
 *      is strict-priority, the news engine shadowed DuckDuckGo and
 *      Bing for every query.
 *
 *   2. The title says the page is not about a role: "What is ERP?",
 *      "Top 20 Highest Paying Jobs in Kenya", "Tracking Your Shipment
 *      | FedEx".
 *
 * A provider whose results all fail this gate is treated as absent, so
 * the chain moves on to the next engine.
 */
export function isJobDiscoveryResult(result: WebSearchResult): boolean {
  if (isNewsRedirectWrapper(result.url)) return false;
  return cleanJobTitle(result.title) !== null;
}

export function overfetchLimitFor(limit: number, plan: QueryPlan): number {
  if (plan.relaxed) return Math.min(Math.max(limit * 5, limit * 2), MAX_OVERFETCH);
  return Math.min(limit * 2, MAX_OVERFETCH);
}

export async function searchWebPlanned(
  query: string,
  options: PlannedSearchOptions = {},
): Promise<PlannedSearchResult> {
  const limit = Math.max(1, options.limit ?? 10);

  const plan = planOperatorQuery(query);
  const categoryQuery = buildCategoryQuery(plan.providerQuery, options.categories ?? []);
  const providerQuery = buildDomainQuery(
    categoryQuery.query,
    options.includeDomains ?? [],
    options.excludeDomains ?? [],
  );

  const overfetch = options.overfetchMultiplier
    ? Math.min(limit * options.overfetchMultiplier, MAX_OVERFETCH)
    : overfetchLimitFor(limit, plan);

  const raw = await searchWeb(providerQuery, {
    ...options,
    limit: overfetch,
    // The gate is the caller's to set — a general web search has no
    // business refusing a result because its title is not a job title.
    // Job discovery gets it by default.
    isValidResult: options.isValidResult ?? isJobDiscoveryResult,
  });

  // 1. Local operator enforcement (site:/inurl:/intitle:/-site:).
  const operatorFiltered = keepOperatorMatches(raw, plan);

  // 2. Local domain re-check (backends drop these silently).
  const domainFiltered = operatorFiltered.items.filter((item) =>
    matchesDomainLists(
      item.url,
      options.includeDomains ?? [],
      options.excludeDomains ?? [],
    ),
  );

  const dropped = raw.length - domainFiltered.length;

  // 3. Slice to the caller's limit — renumber only when the list changed.
  let final = domainFiltered.slice(0, limit);
  if (final.length !== raw.length) {
    final = final.map((item, index) => ({ ...item, position: index + 1 }));
  }

  // 4. Category attribution from the final response.
  const withCategories = final.map((item) => ({
    ...item,
    category: getCategoryFromUrl(item.url, categoryQuery.categoryMap),
  }));

  if (options.cohortKey && dropped > raw.length / 4) {
    // Signal for experiments: aggressive local filtering is where providers
    // are weakest. Sampled deterministically so the metric is comparable
    // across a ramp.
    logger.debug(
      {
        cohortKey: options.cohortKey,
        sampled: sampled(`${options.cohortKey}:operator-drop`, 10),
        dropped,
        raw: raw.length,
      },
      "Search operator drop rate",
    );
  }

  return {
    results: withCategories,
    totalCount: withCategories.length,
    dropped,
    plan,
    providerQuery,
    overfetchLimit: overfetch,
  };
}

/**
 * Recall-first variant for cold regions: fans out to every provider and
 * merges, then enforces operators once at the end.
 */
export async function searchWebPlannedAll(
  query: string,
  options: PlannedSearchOptions = {},
): Promise<PlannedSearchResult> {
  const limit = Math.max(1, options.limit ?? 10);

  const plan = planOperatorQuery(query);
  const categoryQuery = buildCategoryQuery(plan.providerQuery, options.categories ?? []);
  const providerQuery = buildDomainQuery(
    categoryQuery.query,
    options.includeDomains ?? [],
    options.excludeDomains ?? [],
  );

  const { searchWebAll } = await import("./search.js");
  const raw = await searchWebAll(providerQuery, {
    ...options,
    limit: overfetchLimitFor(limit, plan),
  });

  const operatorFiltered = keepOperatorMatches(raw, plan);
  const domainFiltered = operatorFiltered.items.filter((item) =>
    matchesDomainLists(
      item.url,
      options.includeDomains ?? [],
      options.excludeDomains ?? [],
    ),
  );

  const dropped = raw.length - domainFiltered.length;
  let final = domainFiltered.slice(0, limit);
  if (final.length !== raw.length) {
    final = final.map((item, index) => ({ ...item, position: index + 1 }));
  }

  return {
    results: final.map((item) => ({
      ...item,
      category: getCategoryFromUrl(item.url, categoryQuery.categoryMap),
    })),
    totalCount: final.length,
    dropped,
    plan,
    providerQuery,
    overfetchLimit: overfetchLimitFor(limit, plan),
  };
}
