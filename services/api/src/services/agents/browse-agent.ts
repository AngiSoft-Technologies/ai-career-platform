import { query } from "../../db/pool.js";
import { firecrawl } from "../firecrawl/client.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";

/**
 * Browse Agent
 *
 * Visits job listing pages discovered by the SearchEngineAgent using
 * Firecrawl scrape (returns clean markdown instead of raw HTML), then
 * extracts full job details:
 *   - Title, company, location, country, city
 *   - Full description
 *   - Application URL
 *   - Work mode (remote/onsite/hybrid), employment type, salary
 *   - Skills mentioned
 *   - Posted date
 *
 * Stores results in `discovery_candidates` for the DeduplicationAgent.
 *
 * Uses Firecrawl's clean markdown output with heuristics to extract job
 * data from any page structure — no hardcoded per-site selectors.
 */
export class BrowseAgent extends BaseDiscoveryAgent {
  readonly key = "browse_agent";
  readonly name = "Page Browse & Extraction Agent";
  readonly kind = "browse";
  readonly scheduleIntervalMinutes = 30;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    const batchSize = Number(ctx.config.batch_size ?? 20);

    const results = await query<{
      id: string;
      source_url: string;
      query: string;
      source_platform: string;
    }>(
      `SELECT dsr.id, dsr.source_url, dsr.query, dsr.source_platform
         FROM discovery_search_results dsr
        WHERE NOT EXISTS (
          SELECT 1 FROM discovery_candidates dc
           WHERE dc.source_url = dsr.source_url
        )
        ORDER BY dsr.fetched_at ASC
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
    let totalFailed = 0;
    const errors: string[] = [];

    for (const row of results.rows) {
      totalFetched += 1;
      try {
        // Use Firecrawl scrape to get clean markdown content
        if (!firecrawl.isConfigured) {
          errors.push(
            `FIRECRAWL_API_KEY not configured — cannot browse ${row.source_url}`,
          );
          totalFailed += 1;
          continue;
        }

        const scraped = await firecrawl.scrape(row.source_url, {
          onlyMainContent: true,
        });

        if (!scraped) {
          errors.push(`Firecrawl scrape returned no data for ${row.source_url}`);
          totalFailed += 1;
          continue;
        }

        const job = this.extractJobFromMarkdown(
          scraped.markdown,
          row.source_url,
          row.query,
          scraped.title,
          scraped.description,
        );

        if (!job.title) {
          errors.push(`No job title found on ${row.source_url}`);
          totalFailed += 1;
          continue;
        }

        const fingerprint = this.computeFingerprint(
          job.company ?? "unknown",
          job.title,
          job.city ?? "",
          job.postedAt ?? new Date(),
        );

        const existing = await query<{ id: string }>(
          `SELECT id FROM discovery_candidates WHERE fingerprint = $1 OR source_url = $2`,
          [fingerprint, row.source_url],
        );
        if (existing.rows.length > 0) {
          continue; // Already captured
        }

        await query(
          `INSERT INTO discovery_candidates
              (external_id, source_platform, source_url, title, company,
               description, location_raw, country, city, work_mode,
               employment_type, salary_min, salary_max, currency, apply_url,
               skills, posted_at, simhash, fingerprint, status,
               discovered_by_agent_id, discovered_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   $14, $15, $16, $17, $18, $19, $20, $21, now(), now())`,
          [
            job.externalId ?? row.source_url,
            row.source_platform,
            row.source_url,
            job.title,
            job.company ?? null,
            job.description ?? null,
            job.locationRaw ?? null,
            job.country ?? null,
            job.city ?? null,
            job.workMode ?? null,
            job.employmentType ?? null,
            job.salaryMin ?? null,
            job.salaryMax ?? null,
            job.currency ?? null,
            job.applyUrl ?? row.source_url,
            job.skills ?? [],
            job.postedAt ?? null,
            job.simhash ?? null,
            fingerprint,
            "pending",
            ctx.agentId,
          ],
        );
        totalStored += 1;
      } catch (error) {
        errors.push(
          `Browse failed for ${row.source_url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        totalFailed += 1;
      }
    }

    return {
      status: totalFailed === totalFetched && totalStored === 0 ? "failed" : "success",
      jobsFound: totalFetched,
      jobsNew: totalStored,
      jobsDuplicate: totalFailed,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      payload: { batchSize, processed: results.rows.length, firecrawlUsed: firecrawl.isConfigured },
    };
  }

  /**
   * Extracts job details from Firecrawl markdown content.
   * Works on any job page structure without per-site selectors.
   */
  private extractJobFromMarkdown(
    markdown: string,
    sourceUrl: string,
    query: string,
    pageTitle?: string | null,
    pageDescription?: string | null,
  ): {
    externalId?: string;
    title: string;
    company?: string;
    description?: string;
    locationRaw?: string;
    country?: string;
    city?: string;
    workMode?: string;
    employmentType?: string;
    salaryMin?: number;
    salaryMax?: number;
    currency?: string;
    applyUrl?: string;
    skills?: string[];
    postedAt?: Date;
    simhash?: string;
  } {
    const title =
      pageTitle ?? this.extractMarkdownTitle(markdown) ?? "Untitled position";
    const company = this.extractCompany(markdown);
    const description = this.extractDescription(markdown) ?? pageDescription ?? undefined;
    const locationRaw = this.extractLocation(markdown);
    const { country, city } = this.resolveLocation(locationRaw);
    const workMode = this.detectWorkMode(markdown, title);
    const employmentType = this.detectEmploymentType(markdown);
    const { salaryMin, salaryMax, currency } = this.extractSalary(markdown);
    const applyUrl = this.extractApplyUrl(markdown, sourceUrl);
    const skills = this.extractSkills(markdown, title + " " + (description ?? ""));
    const postedAt = this.extractPostedDate(markdown);
    const simhash = this.computeSimhash(company ?? "", title, description ?? "");

    return {
      externalId: this.extractExternalId(markdown, sourceUrl),
      title,
      company: company ?? undefined,
      description,
      locationRaw: locationRaw ?? undefined,
      country,
      city,
      workMode: workMode ?? undefined,
      employmentType: employmentType ?? undefined,
      salaryMin,
      salaryMax,
      currency: currency ?? undefined,
      applyUrl: applyUrl ?? undefined,
      skills,
      postedAt,
      simhash,
    };
  }

  private extractMarkdownTitle(markdown: string): string | undefined {
    // First H1 heading
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1]!.trim();
    // First line that looks like a title
    const firstLine = markdown.trim().split("\n")[0];
    if (firstLine && firstLine.length > 3 && firstLine.length < 200) {
      return firstLine.trim();
    }
    return undefined;
  }

  private extractCompany(markdown: string): string | undefined {
    const patterns = [
      /(?:company|employer|organization)[:\s]+([^\n,|]{2,80})/i,
      /at\s+([A-Z][a-zA-Z0-9\s&]{2,60})/i,
    ];
    for (const pattern of patterns) {
      const match = markdown.match(pattern);
      if (match) return match[1]!.trim();
    }
    return undefined;
  }

  private extractDescription(markdown: string): string | undefined {
    const descMatch = markdown.match(
      /(?:job description|description|about the role|responsibilities)[:\s]*(.{200,3000})/i,
    );
    if (descMatch) return descMatch[1]!.trim();
    const paragraphs = markdown.split(/\n{2,}/).filter((p) => p.trim().length > 100);
    if (paragraphs.length > 0) return paragraphs[0]!.trim().slice(0, 5000);
    return undefined;
  }

  private extractLocation(markdown: string): string | undefined {
    const patterns = [
      /(?:location|based in|located in|city)[:\s]+([^\n,|]{2,100})/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2,})/g,
    ];
    for (const pattern of patterns) {
      const match = markdown.match(pattern);
      if (match) return match[match.length - 1]!.trim();
    }
    return undefined;
  }

  private resolveLocation(
    locationRaw: string | undefined,
  ): { country?: string; city?: string } {
    if (!locationRaw) return {};
    // African countries for MVP focus
    const africanCountries = [
      "Nigeria", "Kenya", "South Africa", "Egypt", "Ethiopia", "Ghana",
      "Morocco", "Tanzania", "Uganda", "Rwanda", "Senegal", "Cameroon",
      "Ivory Coast", "DRC", "Zimbabwe", "Zambia", "Botswana", "Namibia",
      "Mozambique", "Madagascar", "Mali", "Burkina Faso", "Niger",
      "Chad", "Sudan", "Tunisia", "Algeria", "Libya", "Angola",
    ];
    const country = africanCountries.find((c) => locationRaw.includes(c));
    const cityMatch = locationRaw.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    return {
      country,
      city: cityMatch ? cityMatch[1] : undefined,
    };
  }

  private detectWorkMode(text: string, title: string): string | undefined {
    const lower = (text + " " + title).toLowerCase();
    if (lower.includes("remote")) return "remote";
    if (lower.includes("hybrid")) return "hybrid";
    if (lower.includes("onsite") || lower.includes("on-site")) return "onsite";
    return undefined;
  }

  private detectEmploymentType(text: string): string | undefined {
    const lower = text.toLowerCase();
    if (lower.includes("full-time") || lower.includes("fulltime"))
      return "full_time";
    if (lower.includes("part-time") || lower.includes("parttime"))
      return "part_time";
    if (lower.includes("contract")) return "contract";
    if (lower.includes("freelance")) return "freelance";
    if (lower.includes("internship")) return "internship";
    return undefined;
  }

  private extractSalary(text: string): {
    salaryMin?: number;
    salaryMax?: number;
    currency?: string;
  } {
    const patterns = [
      /\$([\d,]+)\s*[-–]\s*\$?([\d,]+)/,
      /KES\s*([\d,]+)\s*[-–]\s*([\d,]+)/,
      /NGN\s*([\d,]+)\s*[-–]\s*([\d,]+)/,
      /ZAR\s*([\d,]+)\s*[-–]\s*([\d,]+)/,
      /EGP\s*([\d,]+)\s*[-–]\s*([\d,]+)/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const min = Number(match[1]!.replace(/,/g, ""));
        const max = Number(match[2]!.replace(/,/g, ""));
        const currency = match[0]!.includes("KES")
          ? "KES"
          : match[0]!.includes("NGN")
            ? "NGN"
            : match[0]!.includes("ZAR")
              ? "ZAR"
              : match[0]!.includes("EGP")
                ? "EGP"
                : "USD";
        return { salaryMin: min, salaryMax: max, currency };
      }
    }
    return {};
  }

  private extractApplyUrl(markdown: string, sourceUrl: string): string | undefined {
    const patterns = [
      /\[(?:apply|application|apply now)\]\(([^)]+)\)/i,
      /<a[^>]*href="([^"]+)"[^>]*>(?:apply|application|apply now)[^<]*<\/a>/gi,
      /apply_url["\s]*[:=]\s*["']([^"']+)["']/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(markdown);
      if (match?.[1]) {
        try {
          return new URL(match[1], sourceUrl).toString();
        } catch {
          // Skip invalid
        }
      }
    }
    return undefined;
  }

  private extractSkills(text: string, haystack: string): string[] {
    const skillDictionary = [
      "javascript", "typescript", "python", "java", "go", "rust", "c#", "c++",
      "php", "ruby", "swift", "kotlin", "dart", "scala", "r",
      "react", "angular", "vue", "svelte", "next.js", "node.js", "express",
      "django", "flask", "spring", "laravel", "rails",
      "aws", "azure", "gcp", "docker", "kubernetes", "terraform",
      "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
      "machine learning", "ai", "data science", "devops", "ci/cd",
      "project management", "product management", "marketing", "sales",
      "design", "ux", "ui", "figma", "photoshop",
    ];
    const found = new Set<string>();
    const lower = haystack.toLowerCase();
    for (const skill of skillDictionary) {
      if (lower.includes(skill.toLowerCase())) found.add(skill);
    }
    return [...found].slice(0, 20);
  }

  private extractPostedDate(text: string): Date | undefined {
    const patterns = [
      /posted\s+(\d+)\s+(day|hour|week|month)s?\s+ago/i,
      /(\d{4})-(\d{2})-(\d{2})/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[1] && match[2]) {
          const num = parseInt(match[1]!, 10);
          const unit = match[2]!;
          const date = new Date();
          if (unit.startsWith("day")) date.setDate(date.getDate() - num);
          if (unit.startsWith("hour")) date.setHours(date.getHours() - num);
          if (unit.startsWith("week")) date.setDate(date.getDate() - num * 7);
          if (unit.startsWith("month")) date.setMonth(date.getMonth() - num);
          return date;
        }
        if (match[3]) {
          return new Date(`${match[1]}-${match[2]}-${match[3]}`);
        }
      }
    }
    return undefined;
  }

  private extractExternalId(markdown: string, sourceUrl: string): string | undefined {
    const idMatch = markdown.match(/(?:job_id|jobId|position_id|vacancy_id)["\s]*[:=]\s*["']([^"']+)["']/i);
    if (idMatch) return idMatch[1]!;
    try {
      const parsed = new URL(sourceUrl);
      return parsed.pathname.replace(/\//g, "_").slice(0, 100);
    } catch {
      return undefined;
    }
  }

  private computeFingerprint(
    company: string,
    title: string,
    city: string,
    postedAt: Date,
  ): string {
    const str = `${company}|${title}|${city}|${postedAt.toISOString()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return String(hash);
  }

  private computeSimhash(
    company: string,
    title: string,
    description: string,
  ): string {
    const text = `${company} ${title} ${description}`;
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return String(hash);
  }
}
