import { aiChat, isAiConfigured } from "../ai/client.js";
import { query } from "../../db/pool.js";
import {
  validateDocumentForAts,
  type AtsReport,
} from "./validate.js";

export interface AtsVerificationInput {
  userId: string;
  documentId?: string | null;
  opportunityId?: string | null;
  content: string;
  targetKeywords?: string[];
}

export interface AtsVerificationResult extends AtsReport {
  suggestions: string[];
  verdict: "ready" | "needs_work" | "high_risk";
  outcome: "screening_likely" | "screening_at_risk" | "screening_unlikely";
}

async function keywordsForOpportunity(
  opportunityId: string,
): Promise<string[]> {
  const result = await query<{
    title: string;
    description: string;
    skills: string[];
  }>(
    `SELECT o.title, o.description,
            COALESCE(array_agg(os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
       FROM opportunities o
       LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
      WHERE o.id = $1
      GROUP BY o.id`,
    [opportunityId],
  );
  const row = result.rows[0];
  if (!row) return [];
  return [
    ...row.skills,
    ...row.title
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3),
  ].slice(0, 40);
}

/**
 * Asks the language model for concrete, human-readable improvements.
 * Returns an empty list when AI is unavailable, never throws.
 */
async function suggestImprovements(
  report: AtsReport,
  content: string,
): Promise<string[]> {
  if (!isAiConfigured()) return [];
  try {
    const response = await aiChat(
      [
        {
          role: "system",
          content:
            "You are an ATS resume reviewer. Reply with a JSON array of at most 5 short, specific fixes. No markdown, no prose.",
        },
        {
          role: "user",
          content: JSON.stringify({
            score: report.score,
            issues: report.issues.map((issue) => issue.message),
            missingKeywords: report.metrics.missingKeywords.slice(0, 12),
            excerpt: content.slice(0, 4000),
          }),
        },
      ],
      { temperature: 0.2, maxTokens: 400 },
    );
    const parsed = JSON.parse(response.replace(/```json|```/g, "").trim()) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Runs the automated ATS verifier for a document and persists the report.
 *
 * The system calls this itself after a resume is imported, created, edited or
 * generated. No user action is required.
 */
export async function runAtsVerification(
  input: AtsVerificationInput,
): Promise<AtsVerificationResult> {
  const content = input.content.trim();
  const keywords =
    input.targetKeywords && input.targetKeywords.length > 0
      ? input.targetKeywords
      : input.opportunityId
        ? await keywordsForOpportunity(input.opportunityId)
        : [];

  const report = await validateDocumentForAts(
    input.userId,
    content,
    keywords,
  );
  const suggestions = await suggestImprovements(report, content);

  const verdict =
    report.score >= 80
      ? "ready"
      : report.score >= 55
        ? "needs_work"
        : "high_risk";
  const outcome =
    report.score >= 80
      ? "screening_likely"
      : report.score >= 55
        ? "screening_at_risk"
        : "screening_unlikely";

  try {
    await query(
      `INSERT INTO ats_reports
         (user_id, document_id, opportunity_id, score, grade, passed, verdict,
          outcome, confidence, issues, matched_keywords, missing_keywords,
          keyword_coverage, sections, metrics)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        input.userId,
        input.documentId ?? null,
        input.opportunityId ?? null,
        report.score,
        report.grade,
        report.passed,
        verdict,
        outcome,
        Math.min(1, Math.max(0.2, report.score / 100)),
        JSON.stringify(report.issues),
        report.metrics.matchedKeywords,
        report.metrics.missingKeywords,
        report.metrics.keywordCoverage,
        JSON.stringify({ sections: report.sections }),
        JSON.stringify({ ...report.metrics, suggestions }),
      ],
    );
  } catch {
    // The verifier is advisory; a storage failure must not block the flow.
  }

  return { ...report, suggestions, verdict, outcome };
}
