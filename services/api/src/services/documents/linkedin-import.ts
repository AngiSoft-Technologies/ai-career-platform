import { FirecrawlClient } from "../firecrawl/client.js";
import { query } from "../../db/pool.js";
import { runAtsVerification } from "./ats-agent.js";
import { structureResumeText } from "./extract.js";
import { buildResumeContent, saveStructuredResume } from "./structured.js";

export interface LinkedInImportResult {
  profile: {
    name: string;
    headline: string;
    skills: number;
    positions: number;
  };
  document: { id: string; title: string; type: string; content: string };
}

/**
 * Fallback importer for public LinkedIn (or portfolio) URLs used when OAuth
 * credentials are not configured. The page is scraped, then the same resume
 * builder agent that handles uploads structures it.
 */
export async function importLinkedInByUrl(input: {
  userId: string;
  profileUrl: string;
}): Promise<LinkedInImportResult> {
  const client = new FirecrawlClient();
  if (!client.isConfigured) {
    throw new Error(
      "Profile import is not configured. Upload your resume or build it manually instead.",
    );
  }

  const scraped = await client.scrape(input.profileUrl);
  const markdown = scraped?.markdown ?? "";
  if (markdown.trim().length < 120) {
    throw new Error(
      "That profile could not be read. LinkedIn often blocks automated access — upload a resume instead.",
    );
  }

  const structured = await structureResumeText(markdown);
  await saveStructuredResume(input.userId, structured);
  const content = buildResumeContent(structured);

  const inserted = await query<{ id: string }>(
    `INSERT INTO documents (user_id, type, title, content, origin, mime_type, parsed_at)
     VALUES ($1, 'cv', $2, $3, 'linkedin', 'text/markdown', now())
     RETURNING id`,
    [input.userId, `${structured.fullName} Resume`, content],
  );
  const document = inserted.rows[0];
  if (!document) throw new Error("DOCUMENT_CREATE_FAILED");

  void runAtsVerification({
    userId: input.userId,
    documentId: document.id,
    content,
  }).catch(() => undefined);

  return {
    profile: {
      name: structured.fullName,
      headline: structured.headline,
      skills: structured.skills.length,
      positions: structured.experiences.length,
    },
    document: {
      id: document.id,
      title: `${structured.fullName} Resume`,
      type: "cv",
      content,
    },
  };
}
