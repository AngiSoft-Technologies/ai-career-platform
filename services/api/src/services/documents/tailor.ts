import { query } from "../../db/pool.js";
import { runDocumentTailoringAgent, type TailoringSource, type TailoringProposal } from "./tailoring-agent.js";
import type { CandidateProfile, Opportunity } from "@angisoft/mboqara-contracts";

export interface TailoredDocuments {
  cv: TailoringProposal;
  coverLetter: TailoringProposal;
  generatedAt: string;
}

export interface ResolvedTailoringSources {
  cv: { id: string; title: string; content: string; updatedAt: string } | null;
  coverLetter: { id: string; title: string; content: string; updatedAt: string } | null;
}

/**
 * Resolves the source material for a job-specific package.
 *
 * The primary resume is the default source. A caller may override it for one
 * preparation, but an override still has to belong to the candidate and still
 * has to be a resume. A job-specific package never overwrites its source.
 */
export async function resolveTailoringSources(input: {
  userId: string;
  sourceCvDocumentId?: string;
  sourceCoverLetterDocumentId?: string;
}): Promise<ResolvedTailoringSources> {
  const cv = await findSourceDocument(input.userId, "cv", input.sourceCvDocumentId);
  const coverLetter = await findSourceDocument(
    input.userId,
    "cover_letter",
    input.sourceCoverLetterDocumentId,
  );

  return { cv, coverLetter };
}

async function findSourceDocument(
  userId: string,
  type: "cv" | "cover_letter",
  explicitId?: string,
): Promise<ResolvedTailoringSources["cv"] | null> {
  if (explicitId) {
    const explicit = await query<{
      id: string;
      title: string;
      content: string;
      updated_at: Date;
    }>(
      `SELECT id, title, content, updated_at
         FROM documents
        WHERE id = $1 AND user_id = $2 AND type = $3`,
      [explicitId, userId, type],
    );
    const row = explicit.rows[0];
    return row
      ? { id: row.id, title: row.title, content: row.content, updatedAt: row.updated_at.toISOString() }
      : null;
  }

  const selected = await query<{
    id: string;
    title: string;
    content: string;
    updated_at: Date;
  }>(
    `SELECT id, title, content, updated_at
       FROM documents
      WHERE user_id = $1
        AND type = $2
        AND (is_base = true OR opportunity_id IS NULL)
      ORDER BY is_base DESC, updated_at DESC, created_at DESC
      LIMIT 1`,
    [userId, type],
  );
  const row = selected.rows[0];
  return row
    ? { id: row.id, title: row.title, content: row.content, updatedAt: row.updated_at.toISOString() }
    : null;
}

/**
 * Generates a complete tailored application package (CV + cover letter) for
 * one opportunity. It fails when tailoring fails: a base document presented as
 * a tailored document is not safe to submit.
 */
export async function generateTailoredDocuments(input: {
  profile: CandidateProfile;
  opportunity: Opportunity;
  sources?: ResolvedTailoringSources;
  sourceCvDocumentId?: string;
  sourceCoverLetterDocumentId?: string;
}): Promise<TailoredDocuments> {
  const { profile, opportunity } = input;
  const sources = input.sources ??
    (await resolveTailoringSources({
      userId: profile.userId,
      sourceCvDocumentId: input.sourceCvDocumentId,
      sourceCoverLetterDocumentId: input.sourceCoverLetterDocumentId,
    }));

  if (!sources.cv) {
    throw new Error("No base CV found. Please upload or create a CV first.");
  }

  const cvSource: TailoringSource = {
    id: sources.cv.id,
    type: "cv",
    title: sources.cv.title,
    content: sources.cv.content,
  };

  const coverLetterSource: TailoringSource = sources.coverLetter
    ? {
        id: sources.coverLetter.id,
        type: "cover_letter",
        title: sources.coverLetter.title,
        content: sources.coverLetter.content,
      }
    : {
        id: "generated",
        type: "cover_letter",
        title: `Cover Letter for ${opportunity.title}`,
        content: buildDefaultCoverLetter(profile, opportunity),
      };

  const [cvResult, coverLetterResult] = await Promise.all([
    runDocumentTailoringAgent({ source: cvSource, profile, opportunity }),
    runDocumentTailoringAgent({ source: coverLetterSource, profile, opportunity }),
  ]);

  return {
    cv: cvResult,
    coverLetter: coverLetterResult,
    generatedAt: new Date().toISOString(),
  };
}

function buildDefaultCoverLetter(profile: CandidateProfile, opportunity: Opportunity): string {
  return `${profile.fullName}
${profile.location}
${profile.email}
${profile.phone || ""}
${profile.linkedin || ""}

${new Date().toLocaleDateString("en-GB")}

Hiring Team
${opportunity.companyName}

Dear Hiring Team,

I am writing to express my interest in the ${opportunity.title} position at ${opportunity.companyName}. With ${profile.yearsExperience} years of experience as a ${profile.headline || profile.seniority} professional, I am excited about the opportunity to contribute to your team.

${profile.summary || "Throughout my career, I have developed expertise in " + profile.skills.slice(0, 5).join(", ") + " and a track of delivering impactful results."}

I am particularly drawn to ${opportunity.companyName} because this role aligns with my experience in ${profile.skills.slice(0, 3).join(", ")}. I would welcome the opportunity to discuss how my experience can add value to your team. Thank you for your consideration.

Kind regards,
${profile.fullName}`;
}
