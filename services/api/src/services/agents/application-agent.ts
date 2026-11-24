import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import { analyseApplicationPage, type ApplicationAnalysis } from "../application/analyzer.js";
import { extractJob, looksLikeJobPosting } from "../engine/extract.js";
import { scrapeUrl } from "../engine/fetch.js";
import { detectAts } from "../engine/ats.js";
import { generateTailoredDocuments, type TailoredDocuments } from "../documents/tailor.js";
import { safeFetch } from "../sources/http.js";
import type { CandidateProfile } from "@angisoft/mboqara-contracts";

/**
 * Application Preparation Agent.
 *
 * This agent runs AUTOMATICALLY when a user views an opportunity.
 * It does the full preparation pipeline without waiting for user clicks:
 *
 * 1. Crawls the employer's application page
 * 2. Extracts form fields, questions, documents required
 * 3. Generates tailored CV + cover letter for THIS specific job
 * 4. Prepares email draft or ATS field mapping
 * 5. Screens employer site for intelligence (culture, tech stack, interview process)
 * 6. Stores everything so the user sees "ready to apply" immediately
 *
 * The user only provides missing info or does human steps (interviews, calls).
 */
export class ApplicationPreparationAgent extends BaseDiscoveryAgent {
  readonly key = "application_preparation";
  readonly name = "Application Preparation Agent";
  readonly kind = "application";
  readonly scheduleIntervalMinutes = 0; // Runs on-demand, not scheduled

  /**
   * Prepares a complete application package for a user viewing an opportunity.
   * Called via API from the opportunity detail page.
   */
  async prepareForUser(input: {
    userId: string;
    opportunityId: string;
    profile: CandidateProfile;
    forceRefresh?: boolean;
  }): Promise<{
    analysis: ApplicationAnalysis;
    documents: TailoredDocuments;
    employerIntel: EmployerIntelligence;
    ready: boolean;
  }> {
    const { userId, opportunityId, profile, forceRefresh = false } = input;

    // Check if we already have a fresh preparation
    if (!forceRefresh) {
      const cached = await this.getCachedPreparation(opportunityId, userId);
      if (cached && this.isFresh(cached.preparedAt)) {
        logger.info({ userId, opportunityId }, "Returning cached application preparation");
        return cached;
      }
    }

    // Get the opportunity details
    const opportunity = await this.getOpportunity(opportunityId);
    if (!opportunity) {
      throw new Error("Opportunity not found");
    }

    // Step 1: Analyze the employer's application page
    const analysis = await analyseApplicationPage({
      applyUrl: opportunity.applyUrl,
      applicationMethod: opportunity.applicationMethod,
      profile,
    });

    // Step 2: Generate tailored documents
    const documents = await generateTailoredDocuments({
      profile,
      opportunity,
    });

    // Step 3: Crawl employer site for intelligence (runs async, cached)
    const employerIntel = await this.gatherEmployerIntelligence(opportunity);

    // Step 4: Store the complete preparation
    const preparation = {
      analysis,
      documents,
      employerIntel,
      preparedAt: new Date().toISOString(),
      ready: true,
    };
    await this.storePreparation(opportunityId, userId, preparation);

    logger.info(
      { userId, opportunityId, platform: analysis.platform, method: analysis.method },
      "Application preparation complete",
    );

    return preparation;
  }

  /**
   * Gets employer intelligence: culture, tech stack, interview process, reviews, etc.
   * Runs in background, cached for 7 days.
   */
  private async gatherEmployerIntelligence(opportunity: any): Promise<EmployerIntelligence> {
    const companyUrl = opportunity.companyWebsite || opportunity.applyUrl;
    const intel: EmployerIntelligence = {
      companyName: opportunity.companyName,
      techStack: [],
      cultureSignals: [],
      interviewProcess: [],
      recentNews: [],
      glassdoorRating: null,
      employeeCount: null,
      fundingStage: null,
    };

    try {
      // Crawl company site
      const scraped = await scrapeUrl(companyUrl, {
        onlyMainContent: true,
        timeoutMs: 15000,
      });

      if (scraped.status >= 200 && scraped.status < 300) {
        intel.techStack = this.extractTechStack(scraped.markdown);
        intel.cultureSignals = this.extractCultureSignals(scraped.markdown);
        intel.interviewProcess = this.extractInterviewProcess(scraped.markdown);
      }

      // Check Glassdoor/other sources (would need API keys)
      // This is where we'd integrate with review APIs

    } catch (error) {
      logger.warn({ error, companyUrl }, "Failed to gather employer intelligence");
    }

    return intel;
  }

  private extractTechStack(markdown: string): string[] {
    const techKeywords = [
      "react", "vue", "angular", "svelte", "next.js", "nuxt",
      "node", "python", "go", "rust", "java", "kotlin", "c#", ".net",
      "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
      "aws", "gcp", "azure", "kubernetes", "docker", "terraform",
      "kafka", "rabbitmq", "graphql", "rest", "grpc",
      "tensorflow", "pytorch", "llm", "rag", "vector",
    ];
    const found: string[] = [];
    const lower = markdown.toLowerCase();
    for (const tech of techKeywords) {
      if (lower.includes(tech)) found.push(tech);
    }
    return found.slice(0, 20);
  }

  private extractCultureSignals(markdown: string): string[] {
    const signals: string[] = [];
    const lower = markdown.toLowerCase();
    const patterns = [
      { key: "remote-first", terms: ["remote first", "remote-first", "distributed team", "work from anywhere"] },
      { key: "async", terms: ["async", "asynchronous", "written communication", "no meetings"] },
      { key: "learning", terms: ["learning budget", "conference budget", "mentorship", "growth"] },
      { key: "wellbeing", terms: ["wellbeing", "mental health", "4-day week", "flexible hours"] },
      { key: "engineering-driven", terms: ["engineering driven", "technical founder", "code review", "testing"] },
    ];
    for (const { key, terms } of patterns) {
      if (terms.some(t => lower.includes(t))) signals.push(key);
    }
    return signals;
  }

  private extractInterviewProcess(markdown: string): string[] {
    const process: string[] = [];
    const lower = markdown.toLowerCase();
    const patterns = [
      "phone screen", "technical interview", "take-home", "pair programming",
      "system design", "behavioral", "culture fit", "values interview",
      "coding challenge", "whiteboard", "live coding", "homework",
    ];
    for (const pattern of patterns) {
      if (lower.includes(pattern)) process.push(pattern);
    }
    return process.slice(0, 10);
  }

  private async getCachedPreparation(opportunityId: string, userId: string): Promise<any> {
    const result = await query(
      `SELECT payload FROM application_preparations
       WHERE opportunity_id = $1 AND user_id = $2
       ORDER BY prepared_at DESC LIMIT 1`,
      [opportunityId, userId],
    );
    return result.rows[0]?.payload ?? null;
  }

  private async storePreparation(opportunityId: string, userId: string, payload: any): Promise<void> {
    await query(
      `INSERT INTO application_preparations (opportunity_id, user_id, payload, prepared_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (opportunity_id, user_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         prepared_at = EXCLUDED.prepared_at`,
      [opportunityId, userId, JSON.stringify(payload)],
    );
  }

  private isFresh(preparedAt: string): boolean {
    const ageHours = (Date.now() - new Date(preparedAt).getTime()) / (1000 * 60 * 60);
    return ageHours < 24; // Fresh for 24 hours
  }

  private async getOpportunity(opportunityId: string): Promise<any> {
    const result = await query(
      `SELECT * FROM opportunities WHERE id = $1`,
      [opportunityId],
    );
    return result.rows[0] ?? null;
  }

  // Required by base class but not used for scheduled runs
  async run(ctx: AgentContext): Promise<AgentRunResult> {
    return { status: "success", jobsFound: 0, jobsNew: 0, jobsDuplicate: 0 };
  }
}

export interface EmployerIntelligence {
  companyName: string;
  techStack: string[];
  cultureSignals: string[];
  interviewProcess: string[];
  recentNews: string[];
  glassdoorRating: number | null;
  employeeCount: number | null;
  fundingStage: string | null;
}

export interface ApplicationPreparation {
  analysis: ApplicationAnalysis;
  documents: TailoredDocuments;
  employerIntel: EmployerIntelligence;
  preparedAt: string;
  ready: boolean;
}