import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { getCandidateProfile } from "../profile.js";
import { runDocumentTailoringAgent, type TailoringSource, type TailoringProposal } from "./tailoring-agent.js";
import type { CandidateProfile, Opportunity } from "@angisoft/mboqara-contracts";

export interface TailoredDocuments {
  cv: TailoringProposal;
  coverLetter: TailoringProposal;
  generatedAt: string;
}

/**
 * Generates a complete tailored application package (CV + Cover Letter)
 * for a specific opportunity and user profile.
 */
export async function generateTailoredDocuments(input: {
  profile: CandidateProfile;
  opportunity: Opportunity;
  analysis?: any;
}): Promise<TailoredDocuments> {
  const { profile, opportunity } = input;

  // Get the user's base CV and cover letter content
  const [baseCv, baseCoverLetter] = await Promise.all([
    getBaseDocument(profile.id, "cv"),
    getBaseDocument(profile.id, "cover_letter"),
  ]);

  if (!baseCv) {
    throw new Error("No base CV found. Please upload or create a CV first.");
  }

  const cvSource: TailoringSource = {
    id: baseCv.id,
    type: "cv",
    title: baseCv.title,
    content: baseCv.content,
  };

  const coverLetterSource: TailoringSource = baseCoverLetter
    ? {
        id: baseCoverLetter.id,
        type: "cover_letter",
        title: baseCoverLetter.title,
        content: baseCoverLetter.content,
      }
    : {
        id: "generated",
        type: "cover_letter",
        title: `Cover Letter for ${opportunity.title}`,
        content: buildDefaultCoverLetter(profile, opportunity),
      };

  // Run both tailoring agents in parallel
  const [cvResult, coverLetterResult] = await Promise.all([
    runDocumentTailoringAgent({ source: cvSource, profile, opportunity }).catch((error) => {
      logger.warn({ error, profileId: profile.id }, "CV tailoring failed, using base");
      return fallbackProposal(cvSource, "CV tailoring will be available after review");
    }),
    runDocumentTailoringAgent({ source: coverLetterSource, profile, opportunity }).catch((error) => {
      logger.warn({ error, profileId: profile.id }, "Cover letter tailoring failed, using base");
      return fallbackProposal(coverLetterSource, "Cover letter will be available after review");
    }),
  ]);

  return {
    cv: cvResult,
    coverLetter: coverLetterResult,
    generatedAt: new Date().toISOString(),
  };
}

function fallbackProposal(source: TailoringSource, note: string): TailoringProposal {
  return {
    content: source.content,
    changes: [note],
    matchedRequirements: [],
    uncoveredRequirements: [],
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

${profile.summary || "Throughout my career, I have developed expertise in " + profile.skills.slice(0, 5).join(", ") + " and a track record of delivering impactful results."}

I am particularly drawn to ${opportunity.companyName} because of ${opportunity.description ? "your work in " + opportunity.description.slice(0, 200) + "..." : "your reputation in the industry"}. My background in ${profile.skills.slice(0, 3).join(", ")} aligns well with what you are looking for.

I would welcome the opportunity to discuss how my experience can add value to your team. Thank you for your consideration.

Kind regards,
${profile.fullName}`;
}

async function getBaseDocument(userId: string, type: "cv" | "cover_letter"): Promise<{ id: string; title: string; content: string } | null> {
  const result = await query(
    `SELECT id, title, content FROM documents
     WHERE user_id = $1 AND type = $2 AND is_base = true
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, type],
  );
  return result.rows[0] ?? null;
}

/**
 * Gets a tailored document from cache if fresh, otherwise generates new.
 */
export async function getOrGenerateTailoredDocuments(input: {
  userId: string;
  opportunityId: string;
  profile: CandidateProfile;
  opportunity: Opportunity;
}): Promise<TailoredDocuments> {
  // Check cache first (valid for 24 hours)
  const cached = await getCachedDocuments(input.userId, input.opportunityId);
  if (cached && isFresh(cached.generatedAt)) {
    logger.info({ userId: input.userId, opportunityId: input.opportunityId }, "Returning cached tailored documents");
    return cached;
  }

  // Generate fresh
  const documents = await generateTailoredDocuments({
    profile: input.profile,
    opportunity: input.opportunity,
  });

  // Store in cache
  await storeCachedDocuments(input.userId, input.opportunityId, documents);

  return documents;
}

async function getCachedDocuments(userId: string, opportunityId: string): Promise<TailoredDocuments | null> {
  const result = await query(
    `SELECT cv_content, cv_changes, cv_matched, cv_uncovered,
            cl_content, cl_changes, cl_matched, cl_uncovered,
            generated_at
     FROM tailored_documents_cache
     WHERE user_id = $1 AND opportunity_id = $2`,
    [userId, opportunityId],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    cv: {
      content: row.cv_content,
      changes: row.cv_changes,
      matchedRequirements: row.cv_matched,
      uncoveredRequirements: row.cv_uncovered,
    },
    coverLetter: {
      content: row.cl_content,
      changes: row.cl_changes,
      matchedRequirements: row.cl_matched,
      uncoveredRequirements: row.cl_uncovered,
    },
    generatedAt: row.generated_at,
  };
}

async function storeCachedDocuments(userId: string, opportunityId: string, documents: TailoredDocuments): Promise<void> {
  await query(
    `INSERT INTO tailored_documents_cache
     (user_id, opportunity_id, cv_content, cv_changes, cv_matched, cv_uncovered,
      cl_content, cl_changes, cl_matched, cl_uncovered, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
       cv_content = EXCLUDED.cv_content,
       cv_changes = EXCLUDED.cv_changes,
       cv_matched = EXCLUDED.cv_matched,
       cv_uncovered = EXCLUDED.cv_uncovered,
       cl_content = EXCLUDED.cl_content,
       cl_changes = EXCLUDED.cl_changes,
       cl_matched = EXCLUDED.cl_matched,
       cl_uncovered = EXCLUDED.cl_uncovered,
       generated_at = EXCLUDED.generated_at`,
    [
      userId,
      opportunityId,
      documents.cv.content,
      documents.cv.changes,
      documents.cv.matchedRequirements,
      documents.cv.uncoveredRequirements,
      documents.coverLetter.content,
      documents.coverLetter.changes,
      documents.coverLetter.matchedRequirements,
      documents.coverLetter.uncoveredRequirements,
      documents.generatedAt,
    ],
  );
}

function isFresh(generatedAt: string): boolean {
  const ageHours = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);
  return ageHours < 24;
}