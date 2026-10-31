import { randomUUID } from "node:crypto";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { aiChat, isAiConfigured } from "../ai/client.js";
import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { downloadObject, getStorageClient } from "../storage.js";
import { runAtsVerification } from "./ats-agent.js";
import {
  buildResumeContent,
  coerceStructuredResume,
  heuristicStructuredResume,
  saveStructuredResume,
  type StructuredResume,
} from "./structured.js";

export interface ResumeImportInput {
  userId: string;
  storageKey: string;
  filename: string;
  contentType: string;
}

export interface ResumeImportResult {
  document: {
    id: string;
    title: string;
    type: string;
    content: string;
    createdAt?: string;
  };
  structured: StructuredResume;
  ats: { score: number; grade: string; passed: boolean };
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

async function transcribeImage(buffer: Buffer, mime: string): Promise<string> {
  if (!isAiConfigured()) return "";
  try {
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    return await aiChat(
      [
        {
          role: "system",
          content:
            "You transcribe resume images. Return only the visible text, preserving line breaks. Never invent content.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this resume image." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      { temperature: 0, maxTokens: 4000 },
    );
  } catch (error) {
    logger.warn({ error }, "Image transcription failed");
    return "";
  }
}

async function extractText(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (contentType === "application/pdf") return extractPdfText(buffer);
  if (contentType === DOCX_MIME) return extractDocxText(buffer);
  if (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/webp"
  ) {
    return transcribeImage(buffer, contentType);
  }
  if (contentType.startsWith("text/")) return buffer.toString("utf8");
  return "";
}

const RESUME_SCHEMA_PROMPT = `You extract resumes into strict JSON. Return only a JSON object, no markdown.
Schema:
{
  "fullName": string,
  "headline": string,
  "summary": string,
  "location": string,
  "country": string,
  "email": string,
  "phone": string,
  "linkedin": string,
  "portfolio": string,
  "yearsExperience": number,
  "seniority": "intern" | "junior" | "mid" | "senior" | "lead",
  "skills": string[],
  "desiredRoles": string[],
  "experiences": [{"title": string, "company": string, "location": string, "startDate": "YYYY-MM", "endDate": "YYYY-MM", "current": boolean, "description": string}],
  "education": [{"degree": string, "institution": string, "location": string, "graduationDate": "YYYY-MM", "gpa": string}],
  "projects": [{"name": string, "description": string, "technologies": string, "url": string}]
}
Rules: use only facts present in the text. Use "" or [] when unknown. Keep achievement bullets verbatim.`;

async function structureWithAi(text: string): Promise<StructuredResume | null> {
  if (!isAiConfigured()) return null;
  try {
    const response = await aiChat(
      [
        { role: "system", content: RESUME_SCHEMA_PROMPT },
        { role: "user", content: text.slice(0, 16_000) },
      ],
      { temperature: 0.1, maxTokens: 3000 },
    );
    const cleaned = response
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return coerceStructuredResume(JSON.parse(cleaned.slice(start, end + 1)));
  } catch (error) {
    logger.warn({ error }, "Resume structuring agent failed");
    return null;
  }
}

/**
 * Turns raw resume/profile text into structured data. Uses the language model
 * when configured and falls back to a deterministic parser otherwise.
 */
export async function structureResumeText(
  text: string,
): Promise<StructuredResume> {
  const structured =
    (await structureWithAi(text)) ?? heuristicStructuredResume(text);
  if (!structured.fullName) structured.fullName = "Candidate";
  if (!structured.headline) {
    structured.headline = structured.experiences[0]?.title || "Professional";
  }
  return structured;
}

/**
 * Extracts an uploaded resume, structures it with the resume builder agent and
 * stores the finished document. The ATS verifier then runs automatically.
 */
export async function importResume(
  input: ResumeImportInput,
): Promise<ResumeImportResult> {
  const { userId, storageKey, filename, contentType } = input;

  const importRow = await query<{ id: string }>(
    `INSERT INTO resume_imports (user_id, storage_key, filename, mime_type, status)
     VALUES ($1, $2, $3, $4, 'processing')
     RETURNING id`,
    [userId, storageKey, filename, contentType],
  );
  const importId = importRow.rows[0]?.id;

  try {
    const buffer = await downloadObject(getStorageClient(), storageKey);
    const text = (await extractText(buffer, contentType)).trim();

    if (text.length < 40) {
      throw new Error(
        "We could not read enough text from that file. Try a text-based PDF or DOCX, or build the resume manually.",
      );
    }

    const structured = await structureResumeText(text);

    await saveStructuredResume(userId, structured);

    const content = buildResumeContent(structured);
    const inserted = await query<{ id: string; created_at: Date }>(
      `INSERT INTO documents (user_id, type, title, content, origin, mime_type, storage_key, parsed_at)
       VALUES ($1, 'cv', $2, $3, 'upload', $4, $5, now())
       RETURNING id, created_at`,
      [
        userId,
        `${structured.fullName} Resume`,
        content,
        contentType,
        storageKey,
      ],
    );
    const document = inserted.rows[0];
    if (!document) throw new Error("DOCUMENT_CREATE_FAILED");

    const ats = await runAtsVerification({
      userId,
      documentId: document.id,
      content,
    });

    if (importId) {
      await query(
        `UPDATE resume_imports
            SET status = 'completed', extracted_text = $2, parsed = $3,
                document_id = $4, confirmed_at = now(), updated_at = now()
          WHERE id = $1`,
        [importId, text.slice(0, 200_000), JSON.stringify(structured), document.id],
      );
    }

    return {
      document: {
        id: document.id,
        title: `${structured.fullName} Resume`,
        type: "cv",
        content,
        createdAt: document.created_at.toISOString(),
      },
      structured,
      ats: { score: ats.score, grade: ats.grade, passed: ats.passed },
    };
  } catch (error) {
    if (importId) {
      await query(
        `UPDATE resume_imports SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
        [
          importId,
          error instanceof Error ? error.message.slice(0, 500) : "IMPORT_FAILED",
        ],
      ).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Registers an upload target and records the intended import. Kept for callers
 * that want an explicit import id before the file is uploaded.
 */
export function createImportId(): string {
  return randomUUID();
}
