import type { Opportunity } from "@angisoft/mboqara-contracts";
import { crawlSite } from "../engine/crawl.js";
import { scrapeUrl } from "../engine/fetch.js";
import { logger } from "../../logger.js";

export interface EmployerResearchSource {
  url: string;
  title?: string;
  description?: string;
  kind: "company" | "careers" | "job" | "application";
}

export interface EmployerIntelligence {
  companyName: string;
  summary: string;
  techStack: string[];
  cultureSignals: string[];
  interviewProcess: string[];
  sources: EmployerResearchSource[];
  pagesVisited: number;
  researchedAt: string;
}

const TECH_TERMS = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "Kotlin",
  "Swift",
  "React",
  "Next.js",
  "Vue",
  "Angular",
  "Node.js",
  "Django",
  "Rails",
  "Spring",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "AWS",
  "Azure",
  "GCP",
  "Docker",
  "Kubernetes",
  "Terraform",
  "GraphQL",
  "REST",
  "Figma",
  "Salesforce",
  "SAP",
];

const CULTURE_TERMS = [
  "remote-first",
  "remote friendly",
  "flexible hours",
  "inclusive",
  "belonging",
  "mentorship",
  "learning budget",
  "career growth",
  "customer-first",
  "mission-driven",
  "impact-driven",
];

const INTERVIEW_TERMS = [
  "screening call",
  "technical interview",
  "virtual interview",
  "onsite interview",
  "panel interview",
  "take-home",
  "assessment",
  "interview process",
];

function sentencesAround(text: string, terms: string[], limit: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const lower = normalized.toLowerCase();
  const found: string[] = [];

  for (const term of terms) {
    let from = 0;
    while (found.length < limit) {
      const index = lower.indexOf(term.toLowerCase(), from);
      if (index < 0) break;
      const start = Math.max(0, index - 90);
      const end = Math.min(normalized.length, index + term.length + 130);
      let snippet = normalized.slice(start, end).trim();
      const sentenceStart = Math.max(snippet.lastIndexOf(". "), snippet.lastIndexOf("! "), snippet.lastIndexOf("? "));
      if (sentenceStart >= 0) snippet = snippet.slice(sentenceStart + 2);
      snippet = snippet.replace(/^[-•|]\s*/, "").trim();
      if (snippet.length > 40 && !found.some((item) => item.toLowerCase() === snippet.toLowerCase())) {
        found.push(snippet);
      }
      from = index + term.length;
    }
  }
  return found.slice(0, limit);
}

/**
 * Researches the employer around one role.
 *
 * The crawler is deliberately bounded and the facts are tied to source URLs.
 * A company name is not intelligence: the result says what was read, where it
 * was read, and when. If the employer's site cannot be reached, the package
 * still proceeds with the role posting itself and says that research was
 * partial rather than inventing facts.
 */
export async function researchEmployer(
  opportunity: Opportunity,
): Promise<EmployerIntelligence> {
  const sources: EmployerResearchSource[] = [];
  let pagesVisited = 0;
  let employerText = "";
  let summary = "";

  const website = opportunity.companyWebsite?.trim();
  if (website) {
    try {
      const [companyPage, crawl] = await Promise.all([
        scrapeUrl(website, {
          onlyMainContent: true,
          timeoutMs: 20_000,
          polite: true,
        }),
        crawlSite(website, {
          maxDepth: 2,
          maxPages: 12,
          timeoutMs: 45_000,
          jobBias: true,
          respectRobots: true,
        }),
      ]);

      employerText = companyPage.markdown ?? "";
      summary = companyPage.metadata.description || companyPage.metadata.ogDescription || "";
      pagesVisited += crawl.pagesVisited;

      sources.push({
        url: companyPage.finalUrl,
        title: companyPage.metadata.title,
        description: companyPage.metadata.description,
        kind: "company",
      });

      for (const jobUrl of crawl.jobUrls.slice(0, 12)) {
        sources.push({ url: jobUrl, kind: "careers" });
      }
    } catch (error) {
      logger.warn(
        { company: opportunity.companyName, error: error instanceof Error ? error.message : String(error) },
        "Employer research could not read the company website",
      );
    }
  }

  try {
    const jobPage = await scrapeUrl(opportunity.applyUrl, {
      onlyMainContent: true,
      timeoutMs: 20_000,
      polite: true,
    });
    employerText = `${employerText}\n${jobPage.markdown ?? ""}`;
    pagesVisited += 1;
    sources.push({
      url: jobPage.finalUrl,
      title: jobPage.metadata.title,
      description: jobPage.metadata.description,
      kind: opportunity.applyUrl === jobPage.finalUrl ? "application" : "job",
    });
  } catch (error) {
    logger.debug(
      { opportunityId: opportunity.id, error: error instanceof Error ? error.message : String(error) },
      "Employer research could not read the role page",
    );
  }

  const techStack = TECH_TERMS.filter((term) =>
    employerText.toLowerCase().includes(term.toLowerCase()),
  ).slice(0, 16);
  const cultureSignals = sentencesAround(employerText, CULTURE_TERMS, 6);
  const interviewProcess = sentencesAround(employerText, INTERVIEW_TERMS, 6);

  return {
    companyName: opportunity.companyName,
    summary,
    techStack,
    cultureSignals,
    interviewProcess,
    sources,
    pagesVisited,
    researchedAt: new Date().toISOString(),
  };
}
