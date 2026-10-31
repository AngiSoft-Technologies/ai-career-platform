import { config } from "../../config.js";
import { logger } from "../../logger.js";

export interface FirecrawlSearchResult {
  url: string;
  title: string;
  description: string;
  markdown?: string;
}

export interface FirecrawlSearchResponse {
  success: boolean;
  data: {
    web: Array<{
      url: string;
      title: string;
      description: string;
      markdown?: string;
    }>;
  };
  error?: string;
}

export interface FirecrawlScrapeResponse {
  success: boolean;
  data: {
    markdown: string;
    html?: string;
    metadata: {
      title?: string;
      description?: string;
      sourceURL: string;
      statusCode?: number;
    };
  };
  error?: string;
}

/**
 * Firecrawl client — wraps the Firecrawl API for search and scraping.
 *
 * All configuration comes from environment variables (FIRECRAWL_API_KEY,
 * FIRECRAWL_BASE_URL). No hardcoded keys.
 *
 * Endpoints used:
 *   POST /v2/search   — web search (returns structured results)
 *   POST /v1/scrape   — scrape a single URL (returns clean markdown)
 */
export class FirecrawlClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = config.FIRECRAWL_API_KEY;
    this.baseUrl = config.FIRECRAWL_BASE_URL.replace(/\/$/, "");
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  /**
   * Search the web using Firecrawl's v2 search endpoint.
   * Returns structured search results with URLs, titles, descriptions.
   */
  async search(query: string, limit = 10): Promise<FirecrawlSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("FIRECRAWL_API_KEY not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/search`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ query, limit }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        logger.warn(
          { status: response.status, query, text },
          "Firecrawl search failed",
        );
        return [];
      }

      const data = (await response.json()) as FirecrawlSearchResponse;
      if (!data.success || !data.data?.web) {
        logger.warn({ data, query }, "Firecrawl search returned no results");
        return [];
      }

      return data.data.web.map((item) => ({
        url: item.url,
        title: item.title,
        description: item.description ?? "",
        markdown: item.markdown,
      }));
    } catch (error) {
      logger.error(
        { query, error },
        "Firecrawl search error",
      );
      return [];
    }
  }

  /**
   * Scrape a single URL using Firecrawl's v1 scrape endpoint.
   * Returns clean markdown content — much easier to parse than raw HTML.
   */
  async scrape(
    url: string,
    options: { onlyMainContent?: boolean } = {},
  ): Promise<{
    markdown: string;
    title?: string;
    description?: string;
    sourceUrl?: string;
  } | null> {
    if (!this.apiKey) {
      throw new Error("FIRECRAWL_API_KEY not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/scrape`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: options.onlyMainContent ?? true,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        logger.warn(
          { status: response.status, url, text },
          "Firecrawl scrape failed",
        );
        return null;
      }

      const data = (await response.json()) as FirecrawlScrapeResponse;
      if (!data.success || !data.data) {
        logger.warn({ data, url }, "Firecrawl scrape returned no data");
        return null;
      }

      return {
        markdown: data.data.markdown,
        title: data.data.metadata.title,
        description: data.data.metadata.description,
        sourceUrl: data.data.metadata.sourceURL,
      };
    } catch (error) {
      logger.error({ url, error }, "Firecrawl scrape error");
      return null;
    }
  }
}

export const firecrawl = new FirecrawlClient();
