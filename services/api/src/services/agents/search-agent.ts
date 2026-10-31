import { query } from "../../db/pool.js";
import { firecrawl } from "../firecrawl/client.js";
import { config } from "../../config.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";

/**
 * Search Engine Agent
 *
 * Discovers job opportunities across the ENTIRE web using Firecrawl search
 * (primary) and DuckDuckGo / SearXNG (fallback). No hardcoded source lists —
 * new platforms (LinkedIn, Facebook, NGO sites, company career pages,
 * Twitter, job boards, etc.) are found dynamically through search queries.
 *
 * MVP focus: Africa — queries target jobs worldwide that African citizens
 * can work on (remote, onsite, hybrid), plus Africa-specific job sites.
 *
 * Output: raw search results stored in `discovery_search_results` for the
 * BrowseAgent to visit and extract full job details via Firecrawl scrape.
 */
export class SearchEngineAgent extends BaseDiscoveryAgent {
  readonly key = "search_engine_agent";
  readonly name = "Search Engine Discovery Agent";
  readonly kind = "search_engine";
  readonly scheduleIntervalMinutes = 60;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const queries =
      (ctx.config.queries as string[] ??
        [
          "site:linkedin.com/jobs Africa hiring remote",
          "site:brightermonday.co.ke jobs",
          "site:ajira.org jobs Kenya",
          "NGO jobs Africa remote",
          "remote jobs Africa hiring",
          "site:facebook.com jobs Africa",
          "UN jobs Africa",
          "World Bank jobs Africa careers",
          "remote software engineer jobs Africa",
          "remote jobs African citizens worldwide",
        ]);
    const maxResultsPerQuery =
      Number(ctx.config.max_results_per_query ?? 10);

    let totalFetched = 0;
    let totalStored = 0;
    let totalDuplicate = 0;
    const errors: string[] = [];

    for (const queryText of queries) {
      // Try Firecrawl search first
      let results: Array<{ url: string; title: string; description: string }> =
        [];

      if (firecrawl.isConfigured) {
        try {
          const firecrawlResults = await firecrawl.search(
            queryText,
            maxResultsPerQuery,
          );
          results = firecrawlResults.map((r) => ({
            url: r.url,
            title: r.title,
            description: r.description,
          }));
        } catch (error) {
          errors.push(
            `Firecrawl search failed for "${queryText}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Fallback to DuckDuckGo if Firecrawl unavailable or empty
      if (results.length === 0) {
        try {
          const ddgResults = await this.duckDuckGoSearch(
            queryText,
            maxResultsPerQuery,
          );
          results = ddgResults;
        } catch (error) {
          errors.push(
            `DuckDuckGo search failed for "${queryText}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      totalFetched += results.length;

      for (const result of results) {
        try {
          const existing = await query<{ id: string }>(
            `SELECT id FROM discovery_search_results WHERE source_url = $1`,
            [result.url],
          );
          if (existing.rows.length > 0) {
            totalDuplicate += 1;
            continue;
          }

          await query(
            `INSERT INTO discovery_search_results
                (agent_id, query, source_platform, source_url, title, snippet, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())`,
            [
              ctx.agentId,
              queryText,
              result.url.includes("linkedin.com")
                ? "linkedin"
                : result.url.includes("facebook.com")
                  ? "facebook"
                  : result.url.includes("brightermonday")
                    ? "brightermonday"
                    : result.url.includes("ajira")
                      ? "ajira"
                      : "web",
              result.url,
              result.title ?? null,
              result.description ?? null,
            ],
          );
          totalStored += 1;
        } catch (insertError) {
          errors.push(
            `Insert failed for ${result.url}: ${
              insertError instanceof Error
                ? insertError.message
                : String(insertError)
            }`,
          );
        }
      }
    }

    return {
      status: errors.length > 0 && totalStored === 0 ? "failed" : "success",
      jobsFound: totalFetched,
      jobsNew: totalStored,
      jobsDuplicate: totalDuplicate,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      payload: {
        queriesProcessed: queries.length,
        firecrawlConfigured: firecrawl.isConfigured,
      },
    };
  }

  /**
   * DuckDuckGo HTML search fallback (modeled after Firecrawl's ddgsearch.ts).
   * Scrapes html.duckduckgo.com with rotating user agents and anti-bot handling.
   */
  private async duckDuckGoSearch(
    query: string,
    limit: number,
  ): Promise<Array<{ url: string; title: string; description: string }>> {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    ];

    const userAgent =
      userAgents[Math.floor(Math.random() * userAgents.length)]!;

    const params = new URLSearchParams({ q: query, kp: "1" });
    const url = `https://html.duckduckgo.com/html?${params.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Upgrade-Insecure-Requests": "1",
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        throw new Error(`DDG HTTP ${response.status}`);
      }

      const html = await response.text();

      // Check for anti-bot
      if (html.includes("anomaly-modal")) {
        throw new Error("DDG anti-bot detected");
      }

      const results: Array<{ url: string; title: string; description: string }> =
        [];

      // Parse result links — DuckDuckGo uses .result__a for titles and .result__snippet for descriptions
      const resultRegex =
        /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      const snippetRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;

      const titles: string[] = [];
      const urls: string[] = [];
      const snippets: string[] = [];

      let match: RegExpExecArray | null;
      while ((match = resultRegex.exec(html)) !== null) {
        let rawUrl = match[1]!;
        const title = match[2]!.trim();

        // DuckDuckGo wraps URLs in uddg parameter
        if (rawUrl.includes("uddg=")) {
          try {
            const uddgUrl = new URL(rawUrl, "https://duckduckgo.com");
            const uddg = uddgUrl.searchParams.get("uddg");
            if (uddg) rawUrl = decodeURIComponent(uddg);
          } catch {
            // Keep original
          }
        }

        urls.push(rawUrl);
        titles.push(title);
      }

      let snippetMatch: RegExpExecArray | null;
      while ((snippetMatch = snippetRegex.exec(html)) !== null) {
        snippets.push(snippetMatch[1]!.trim());
      }

      for (let i = 0; i < Math.min(urls.length, limit); i++) {
        const url = urls[i]!;
        const title = titles[i] || "Untitled position";
        const description = snippets[i] ?? "";
        results.push({
          url,
          title,
          description,
        });
      }

      return results;
    } catch (error) {
      throw error;
    }
  }
}
