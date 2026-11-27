import { aiChat, isAiConfigured } from "../ai/client.js";
import { query } from "../../db/pool.js";
import {
  markdownToResumeDocument,
  normaliseResumeDocument,
  type ResumeCoverLetter,
  type ResumeDocument,
  type ResumeDocumentKind,
  type ResumeEntry,
  type ResumeSection,
} from "@angisoft/mboqara-contracts";

export type RewriteType = "full";

export interface DocumentImprovementRow {
  id: string;
  document_id: string;
  user_id: string;
  rewrite_type: string;
  status: string;
  snapshot: ResumeDocument | null;
  result: { resume: ResumeDocument } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentImprovementResult {
  id: string;
  status: "granted" | "pending" | "processing" | "success" | "failed";
  rewrite_type: string;
  result?: { resume: ResumeDocument };
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "IMPROVEMENT_FAILED";
}

function cleanJsonResponse(response: string): string {
  return response.replace(/```json|```/g, "").trim();
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => stringOrNull(item))
    .filter((item): item is string => item !== null);
  return items.length ? items : null;
}

/**
 * Applies only wording.
 *
 * Nothing may be added, removed, reordered or invented. A missing field keeps
 * the original value, so a truncated AI response can never delete evidence.
 */
function applyImprovement(
  document: ResumeDocument,
  proposal: unknown,
): ResumeDocument {
  const doc = normaliseResumeDocument(document);
  if (typeof proposal !== "object" || proposal === null) return doc;
  const source = proposal as Record<string, unknown>;

  const contactSource =
    typeof source.contact === "object" && source.contact !== null
      ? (source.contact as Record<string, unknown>)
      : {};
  const headline = stringOrNull(source.headline) ?? stringOrNull(contactSource.headline);
  if (headline) doc.contact.headline = headline;

  const proposedSections = Array.isArray(source.sections) ? source.sections : [];
  const sectionById = new Map<string, Record<string, unknown>>();
  for (const section of proposedSections) {
    if (typeof section !== "object" || section === null) continue;
    const record = section as Record<string, unknown>;
    const id = stringOrNull(record.id);
    if (id) sectionById.set(id, record);
  }

  doc.sections = doc.sections.map((section: ResumeSection) => {
    const proposed = sectionById.get(section.id);
    if (!proposed) return section;
    const title = stringOrNull(proposed.title);
    const proposedEntries = Array.isArray(proposed.entries) ? proposed.entries : [];
    const entryById = new Map<string, Record<string, unknown>>();
    proposedEntries.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) return;
      const record = entry as Record<string, unknown>;
      const id = stringOrNull(record.id) ?? section.entries[index]?.id;
      if (id) entryById.set(id, record);
    });

    return {
      ...section,
      title: title ?? section.title,
      entries: section.entries.map((entry: ResumeEntry, index: number) => {
        const patch = entryById.get(entry.id) ?? entryById.get(section.entries[index]?.id ?? "");
        if (!patch) return entry;
        const bullets = stringArrayOrNull(patch.bullets);
        const tags = stringArrayOrNull(patch.tags);
        const summary = stringOrNull(patch.summary);
        const titleField = stringOrNull(patch.title);
        const organisation = stringOrNull(patch.organisation);
        const location = stringOrNull(patch.location);
        const date = stringOrNull(patch.date);
        const url = stringOrNull(patch.url);
        return {
          ...entry,
          title: titleField ?? entry.title,
          organisation: organisation ?? entry.organisation,
          location: location ?? entry.location,
          date: date ?? entry.date,
          url: url ?? entry.url,
          summary: summary ?? entry.summary,
          bullets:
            bullets && bullets.length === entry.bullets.length ? bullets : entry.bullets,
          tags: tags && tags.length === entry.tags.length ? tags : entry.tags,
        };
      }),
    };
  });

  if (doc.kind === "cover_letter" && doc.coverLetter) {
    const proposed = source.coverLetter as Record<string, unknown> | undefined;
    if (proposed && typeof proposed === "object") {
      const mergeLetter = (current: ResumeCoverLetter, patch: Record<string, unknown>): ResumeCoverLetter => ({
        recipientName: stringOrNull(patch.recipientName) ?? current.recipientName,
        recipientCompany: stringOrNull(patch.recipientCompany) ?? current.recipientCompany,
        recipientAddress: stringOrNull(patch.recipientAddress) ?? current.recipientAddress,
        subject: stringOrNull(patch.subject) ?? current.subject,
        greeting: stringOrNull(patch.greeting) ?? current.greeting,
        body: stringOrNull(patch.body) ?? current.body,
        signoff: stringOrNull(patch.signoff) ?? current.signoff,
      });
      doc.coverLetter = mergeLetter(doc.coverLetter, proposed);
    }
  }

  return normaliseResumeDocument(doc);
}

/** Rewrites the wording of the structured document without changing facts. */
export async function improveDocumentWording(
  document: ResumeDocument,
): Promise<ResumeDocument> {
  const doc = normaliseResumeDocument(document);

  if (!isAiConfigured()) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const payload = JSON.stringify(
    doc.kind === "cover_letter"
      ? {
          kind: doc.kind,
          headline: doc.contact.headline,
          coverLetter: doc.coverLetter,
        }
      : {
          kind: doc.kind,
          contact: {
            headline: doc.contact.headline,
            email: doc.contact.email,
            phone: doc.contact.phone,
            location: doc.contact.location,
            website: doc.contact.website,
            linkedin: doc.contact.linkedin,
          },
          sections: doc.sections.map((section) => ({
            id: section.id,
            title: section.title,
            entries: section.entries.map((entry) => ({
              id: entry.id,
              title: entry.title,
              organisation: entry.organisation,
              location: entry.location,
              date: entry.date,
              url: entry.url,
              summary: entry.summary,
              bullets: entry.bullets,
              tags: entry.tags,
            })),
          })),
        },
  );

  const response = await aiChat(
    [
      {
        role: "system",
        content:
          "You rewrite the wording of an existing resume in place. Keep every fact, section, entry and bullet. Do not add, remove, reorder or invent anything. Return only the same JSON object with improved professional wording.",
      },
      { role: "user", content: payload },
    ],
    { temperature: 0.25, maxTokens: 5000 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonResponse(response));
  } catch {
    throw new Error("AI_RESPONSE_NOT_JSON");
  }

  return applyImprovement(doc, parsed);
}

function rowToResult(row: DocumentImprovementRow): DocumentImprovementResult {
  const base: DocumentImprovementResult = {
    id: row.id,
    status: row.status as DocumentImprovementResult["status"],
    rewrite_type: row.rewrite_type,
  };
  if (row.result?.resume) base.result = { resume: row.result.resume };
  if (row.error) base.error = row.error;
  return base;
}

/** Grants an improvement job, exactly like Resumonk's first AI call. */
export async function createDocumentImprovement(input: {
  documentId: string;
  userId: string;
  rewriteType?: RewriteType;
  idempotencyKey?: string;
}): Promise<DocumentImprovementResult> {
  if (input.idempotencyKey) {
    const existing = await query<DocumentImprovementRow>(
      `SELECT id, document_id, user_id, rewrite_type, status, snapshot, result, error, created_at, updated_at
         FROM document_improvements
        WHERE idempotency_key = $1 AND document_id = $2 AND user_id = $3`,
      [input.idempotencyKey, input.documentId, input.userId],
    );
    if (existing.rows[0]) return rowToResult(existing.rows[0]);
  }

  const owned = await query<{ id: string }>(
    "SELECT id FROM documents WHERE id = $1 AND user_id = $2",
    [input.documentId, input.userId],
  );
  if (!owned.rows[0]) {
    const error = new Error("DOCUMENT_NOT_FOUND") as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  const inserted = await query<DocumentImprovementRow>(
    `INSERT INTO document_improvements
       (document_id, user_id, rewrite_type, status, idempotency_key)
     VALUES ($1, $2, $3, 'granted', $4)
     RETURNING id, document_id, user_id, rewrite_type, status, snapshot, result, error, created_at, updated_at`,
    [
      input.documentId,
      input.userId,
      input.rewriteType ?? "full",
      input.idempotencyKey ?? null,
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("IMPROVEMENT_CREATE_FAILED");
  return rowToResult(row);
}

async function processImprovement(id: string): Promise<void> {
  const improvement = await query<DocumentImprovementRow>(
    `SELECT id, document_id, user_id, rewrite_type, status, snapshot, result, error, created_at, updated_at
       FROM document_improvements WHERE id = $1`,
    [id],
  );
  const row = improvement.rows[0];
  // A pending row is exactly what `enqueue` just wrote; it must be processed.
  // `success` and `processing` are terminal or in-flight and are not restarted.
  if (!row || row.status === "success" || row.status === "processing") return;

  await query(
    "UPDATE document_improvements SET status = 'processing', updated_at = now() WHERE id = $1",
    [id],
  );

  const documentResult = await query<{
    resume_data: unknown;
    content: string;
    type: string;
  }>(
    "SELECT resume_data, content, type FROM documents WHERE id = $1 AND user_id = $2",
    [row.document_id, row.user_id],
  );
  const documentRow = documentResult.rows[0];
  if (!documentRow) throw new Error("DOCUMENT_NOT_FOUND");

  const kind: ResumeDocumentKind =
    documentRow.type === "cover_letter" ? "cover_letter" : "resume";
  const snapshot = normaliseResumeDocument(
    row.snapshot ??
      documentRow.resume_data ??
      markdownToResumeDocument(documentRow.content, kind),
  );
  const improved = await improveDocumentWording(snapshot);

  await query(
    `UPDATE document_improvements
       SET status = 'success',
           result = $2,
           error = NULL,
           updated_at = now(),
           completed_at = now()
     WHERE id = $1`,
    [id, JSON.stringify({ resume: improved })],
  );
}

/**
 * Enqueues the improvement job.
 *
 * The request returns immediately, exactly like Resumonk's enqueue call, and
 * the UI polls the job while the candidate keeps working.
 */
export async function enqueueDocumentImprovement(input: {
  id: string;
  documentId: string;
  userId: string;
  resumeData?: unknown;
}): Promise<DocumentImprovementResult> {
  const improvement = await query<DocumentImprovementRow>(
    `SELECT id, document_id, user_id, rewrite_type, status, snapshot, result, error, created_at, updated_at
       FROM document_improvements WHERE id = $1 AND document_id = $2 AND user_id = $3`,
    [input.id, input.documentId, input.userId],
  );
  const row = improvement.rows[0];
  if (!row) {
    const error = new Error("IMPROVEMENT_NOT_FOUND") as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  if (row.status === "success" && row.result?.resume) return rowToResult(row);
  if (row.status === "failed") {
    await query(
      "UPDATE document_improvements SET status = 'granted', error = NULL, updated_at = now() WHERE id = $1",
      [row.id],
    );
  }

  const snapshot =
    input.resumeData === undefined
      ? row.snapshot ?? null
      : normaliseResumeDocument(input.resumeData);

  await query(
    `UPDATE document_improvements
       SET status = 'pending',
           snapshot = COALESCE($2, snapshot),
           error = NULL,
           updated_at = now(),
           completed_at = NULL
     WHERE id = $1`,
    [row.id, snapshot ? JSON.stringify(snapshot) : null],
  );

  void processImprovement(row.id).catch(async (error: unknown) => {
    await query(
      `UPDATE document_improvements
         SET status = 'failed',
             error = $2,
             updated_at = now(),
             completed_at = now()
       WHERE id = $1`,
      [row.id, errorMessage(error).slice(0, 500)],
    );
  });

  return {
    id: row.id,
    status: "pending",
    rewrite_type: row.rewrite_type,
  };
}

/** Polls an improvement job: granted, pending, processing, success or failed. */
export async function getDocumentImprovement(input: {
  id: string;
  documentId: string;
  userId: string;
}): Promise<DocumentImprovementResult> {
  const improvement = await query<DocumentImprovementRow>(
    `SELECT id, document_id, user_id, rewrite_type, status, snapshot, result, error, created_at, updated_at
       FROM document_improvements WHERE id = $1 AND document_id = $2 AND user_id = $3`,
    [input.id, input.documentId, input.userId],
  );
  const row = improvement.rows[0];
  if (!row) {
    const error = new Error("IMPROVEMENT_NOT_FOUND") as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  return rowToResult(row);
}