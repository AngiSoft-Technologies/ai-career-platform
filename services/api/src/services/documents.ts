import type { DocumentDraft } from "@angisoft/job-radar-contracts";
import { query } from "../db/pool.js";
import { getOpportunity } from "./opportunities.js";
import { getProfile } from "./profile.js";
import { runDocumentTailoringAgent, type TailoringProposal } from "./documents/tailoring-agent.js";

type DocumentType = DocumentDraft["type"];

export interface PreparedDocumentTailoring extends TailoringProposal {
  sourceDocumentId: string;
  opportunityId: string;
  type: "cv" | "cover_letter";
  title: string;
}

interface DocumentRow {
  id: string;
  application_id: string | null;
  opportunity_id: string;
  parent_document_id?: string | null;
  type: DocumentType;
  title: string;
  content: string;
}

function buildCoverLetter(
  fullName: string,
  headline: string,
  summary: string,
  skills: string[],
  company: string,
  title: string,
): string {
  const topSkills = skills.slice(0, 5).join(", ");
  return `Dear Hiring Team at ${company},

I am applying for the ${title} role. I am a ${headline.toLowerCase()} with hands-on experience across ${topSkills}. ${summary}

What draws me to ${company} is the opportunity to contribute to its work. I would welcome the chance to discuss how my profile and skills could support the ${title} role.

I would welcome the chance to discuss how my experience can support ${company}'s goals. Thank you for your time and consideration.

Sincerely,
${fullName}`;
}

function buildEmail(
  fullName: string,
  company: string,
  title: string,
  skills: string[],
): string {
  const topSkills = skills.slice(0, 4).join(", ");
  return `Subject: Application for ${title} - ${fullName}

Dear Hiring Team at ${company},

Please find attached my CV and cover letter for the ${title} position. My profile highlights my skills in ${topSkills} and relevant experience.

I would appreciate the opportunity to discuss the role further.

Best regards,
${fullName}`;
}

function buildCv(
  fullName: string,
  headline: string,
  summary: string,
  location: string,
  skills: string[],
  company: string,
  title: string,
): string {
  return `${fullName}
${headline}
${location}

SUMMARY
${summary}

TARGET ROLE
${title} at ${company}

CORE SKILLS
${skills.map((skill) => `- ${skill}`).join("\n")}

EXPERIENCE
Add your roles, employers, dates, and achievements. Replace this prompt with details from your actual work history.

EDUCATION
- Add your education details here.

References available on request.`;
}

export async function generateDocument(input: {
  userId: string;
  opportunityId: string;
  type: DocumentType;
  applicationId?: string;
}): Promise<DocumentDraft> {
  const [profile, opportunity] = await Promise.all([
    getProfile(input.userId),
    getOpportunity(input.opportunityId),
  ]);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");

  let title: string;
  let content: string;

  switch (input.type) {
    case "cover_letter":
      title = `Cover letter - ${opportunity.title} at ${opportunity.companyName}`;
      content = buildCoverLetter(
        profile.fullName,
        profile.headline,
        profile.summary,
        profile.skills,
        opportunity.companyName,
        opportunity.title,
      );
      break;
    case "application_email":
      title = `Application email - ${opportunity.title}`;
      content = buildEmail(
        profile.fullName,
        opportunity.companyName,
        opportunity.title,
        profile.skills,
      );
      break;
    case "cv":
      title = `CV - ${profile.fullName}`;
      content = buildCv(
        profile.fullName,
        profile.headline,
        profile.summary,
        profile.location,
        profile.skills,
        opportunity.companyName,
        opportunity.title,
      );
      break;
    case "answer":
      title = `Application answers - ${opportunity.title}`;
      content = `Why this role: I am excited by the ${opportunity.title} opportunity at ${opportunity.companyName} because it aligns with my experience in ${profile.skills.slice(0, 3).join(", ")}.\n\nRelevant experience: ${profile.summary}\n\nSalary expectations: Open to discussion based on the full package and scope.`;
      break;
    default:
      throw new Error("UNSUPPORTED_DOCUMENT_TYPE");
  }

  const inserted = await query<DocumentRow>(
    `INSERT INTO documents (user_id, opportunity_id, application_id, type, title, content)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, application_id, opportunity_id, type, title, content`,
    [
      input.userId,
      input.opportunityId,
      input.applicationId ?? null,
      input.type,
      title,
      content,
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("DOCUMENT_CREATE_FAILED");

  return {
    id: row.id,
    applicationId: row.application_id ?? undefined,
    opportunityId: row.opportunity_id,
    type: row.type,
    title: row.title,
    content: row.content,
  };
}

export async function prepareDocumentTailoring(input: {
  userId: string;
  sourceDocumentId: string;
  opportunityId: string;
}): Promise<PreparedDocumentTailoring> {
  const sourceResult = await query<{
    id: string;
    type: string;
    title: string;
    content: string;
  }>(
    `SELECT id, type, title, content
       FROM documents WHERE id = $1 AND user_id = $2`,
    [input.sourceDocumentId, input.userId],
  );
  const source = sourceResult.rows[0];
  if (!source) throw new Error("DOCUMENT_NOT_FOUND");
  if (source.type !== "cv" && source.type !== "cover_letter") {
    throw new Error("DOCUMENT_TYPE_CANNOT_BE_TAILORED");
  }

  const [profile, opportunity] = await Promise.all([
    getProfile(input.userId),
    getOpportunity(input.opportunityId),
  ]);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");

  const proposal = await runDocumentTailoringAgent({
    source: {
      id: source.id,
      type: source.type,
      title: source.title,
      content: source.content,
    },
    profile,
    opportunity,
  });

  return {
    sourceDocumentId: source.id,
    opportunityId: opportunity.id,
    type: source.type,
    title: `${source.type === "cv" ? "Resume" : "Cover letter"} — ${opportunity.title} at ${opportunity.companyName}`,
    ...proposal,
  };
}

export async function listDocuments(
  userId: string,
  opportunityId?: string,
): Promise<DocumentDraft[]> {
  const result = await query<DocumentRow>(
    `SELECT id, application_id, opportunity_id, parent_document_id, type, title, content
     FROM documents
     WHERE user_id = $1 AND ($2::uuid IS NULL OR opportunity_id = $2)
     ORDER BY created_at DESC`,
    [userId, opportunityId ?? null],
  );

  return result.rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id ?? undefined,
    opportunityId: row.opportunity_id,
    parentDocumentId: row.parent_document_id ?? undefined,
    type: row.type,
    title: row.title,
    content: row.content,
  }));
}
