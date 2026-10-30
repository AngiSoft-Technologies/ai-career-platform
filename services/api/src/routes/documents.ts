import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";
import { contentToExportSections, renderDocument } from "../services/documents/export.js";
import { slugify } from "../services/ingestion/pipeline.js";
import { validateDocumentForAts, validateRequestSchema } from "../services/documents/validate.js";
import {
  generateDocument,
  listDocuments,
  prepareDocumentTailoring,
} from "../services/documents.js";
import { createUploadTarget } from "../services/storage.js";
import { humanizeStatus, notify } from "../services/notifications.js";

const generateSchema = z.object({
  opportunityId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  type: z.enum(["cv", "cover_letter", "application_email", "answer"]),
});

const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
});

export const documentsRouter = Router();

documentsRouter.get("/", async (request, response) => {
  const opportunityId =
    typeof request.query.opportunityId === "string"
      ? request.query.opportunityId
      : undefined;
  const documents = await listDocuments(
    response.locals.userId as string,
    opportunityId,
  );
  response.json({ items: documents, documents });
});

documentsRouter.post("/generate", async (request, response) => {
  const input = generateSchema.parse(request.body);
  const document = await generateDocument({
    userId: response.locals.userId as string,
    opportunityId: input.opportunityId,
    applicationId: input.applicationId,
    type: input.type,
  });
  broadcast(
    "document.generated",
    {
      documentId: document.id,
      type: document.type,
    },
    response.locals.userId as string,
  );
  await notify(response.locals.userId as string, {
    type: "document",
    title: "Your document is ready",
    body: `${humanizeStatus(document.type)} generated — review it before you send it.`,
  });
  response.status(201).json({ document });
});

const updateSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  content: z.string().max(200_000).optional(),
});

const tailorSchema = z.object({ opportunityId: z.string().uuid() });

documentsRouter.post("/:id/tailor", async (request, response, next) => {
  try {
    const sourceDocumentId = z.string().uuid().parse(request.params.id);
    const input = tailorSchema.parse(request.body);
    const proposal = await prepareDocumentTailoring({
      userId: response.locals.userId as string,
      sourceDocumentId,
      opportunityId: input.opportunityId,
    });
    response.json({ proposal });
  } catch (error) {
    next(error);
  }
});

documentsRouter.get("/:id", async (request, response, next) => {
  try {
    const documentId = z.string().uuid().parse(request.params.id);
    const result = await query(
      `SELECT id, opportunity_id, parent_document_id, type, title, content, created_at
         FROM documents WHERE id = $1 AND user_id = $2`,
      [documentId, response.locals.userId as string],
    );
    const row = result.rows[0];
    if (!row) {
      response.status(404).json({ error: "Document not found" });
      return;
    }
    response.json({
      id: row.id,
      opportunityId: row.opportunity_id,
      parentDocumentId: row.parent_document_id ?? undefined,
      type: row.type,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.patch("/:id", async (request, response, next) => {
  try {
    const documentId = z.string().uuid().parse(request.params.id);
    const input = updateSchema.parse(request.body);
    const result = await query(
      `UPDATE documents
          SET title = COALESCE($3, title),
              content = COALESCE($4, content)
        WHERE id = $1 AND user_id = $2
        RETURNING id, opportunity_id, type, title, content, created_at`,
      [documentId, response.locals.userId as string, input.title ?? null, input.content ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      response.status(404).json({ error: "Document not found" });
      return;
    }
    broadcast("document.updated", { documentId }, response.locals.userId as string);
    response.json({
      id: row.id,
      opportunityId: row.opportunity_id,
      type: row.type,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/:id/versions", async (request, response, next) => {
  try {
    const documentId = z.string().uuid().parse(request.params.id);
    const input = z.object({
      title: z.string().min(1).max(240).optional(),
      content: z.string().max(200_000).optional(),
      opportunityId: z.string().uuid().optional(),
    }).parse(request.body ?? {});
    const source = await query<{
      opportunity_id: string;
      parent_document_id: string | null;
      application_id: string | null;
      type: string;
      title: string;
      content: string;
    }>(
      `SELECT opportunity_id, parent_document_id, application_id, type, title, content
         FROM documents WHERE id = $1 AND user_id = $2`,
      [documentId, response.locals.userId as string],
    );
    const row = source.rows[0];
    if (!row) {
      response.status(404).json({ error: "Document not found" });
      return;
    }
    const opportunityId = input.opportunityId ?? row.opportunity_id;
    if (input.opportunityId) {
      const opportunity = await query<{ id: string }>(
        "SELECT id FROM opportunities WHERE id = $1",
        [input.opportunityId],
      );
      if (!opportunity.rows[0]) {
        response.status(404).json({ error: "Opportunity not found" });
        return;
      }
    }
    let applicationId = row.application_id;
    if (opportunityId !== row.opportunity_id) {
      const targetApplication = await query<{ id: string }>(
        `SELECT id FROM applications
          WHERE user_id = $1 AND opportunity_id = $2
          ORDER BY created_at DESC LIMIT 1`,
        [response.locals.userId as string, opportunityId],
      );
      applicationId = targetApplication.rows[0]?.id ?? null;
    }
    const inserted = await query(
      `INSERT INTO documents (user_id, opportunity_id, application_id, parent_document_id, type, title, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, opportunity_id AS "opportunityId", parent_document_id AS "parentDocumentId", type, title, content, created_at AS "createdAt"`,
      [response.locals.userId as string, opportunityId, applicationId, row.parent_document_id ?? documentId, row.type,
        input.title ?? `${row.title} — tailored copy`, input.content ?? row.content],
    );
    const document = inserted.rows[0];
    if (!document) throw new Error("DOCUMENT_VERSION_CREATE_FAILED");
    broadcast("document.generated", { documentId: document.id, type: document.type }, response.locals.userId as string);
    response.status(201).json({ document });
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/validate", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = validateRequestSchema.parse(request.body);

    let content = input.content ?? "";
    let opportunityId = input.opportunityId ?? null;

    if (input.documentId) {
      const document = await query<{ content: string; opportunity_id: string }>(
        "SELECT content, opportunity_id FROM documents WHERE id = $1 AND user_id = $2",
        [input.documentId, userId],
      );
      const row = document.rows[0];
      if (!row) {
        response.status(404).json({ error: "Document not found" });
        return;
      }
      content = content || row.content;
      opportunityId = opportunityId ?? row.opportunity_id;
    }

    if (!content.trim()) {
      response.status(400).json({
        error: "NO_CONTENT",
        message: "Provide documentId or content to validate.",
      });
      return;
    }

    let keywords = input.keywords ?? [];
    if (keywords.length === 0 && opportunityId) {
      const opportunity = await query<{ title: string; skills: string[]; description: string }>(
        `SELECT o.title, o.description,
                COALESCE(array_agg(os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
           FROM opportunities o
           LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
          WHERE o.id = $1
          GROUP BY o.id`,
        [opportunityId],
      );
      const row = opportunity.rows[0];
      if (row) {
        keywords = [
          ...row.skills,
          ...row.title.toLowerCase().split(/\W+/).filter((word) => word.length > 3),
        ].slice(0, 40);
      }
    }

    const report = await validateDocumentForAts(userId, content, keywords);
    response.json({ report });
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/upload-url", async (request, response) => {
  const input = uploadSchema.parse(request.body);
  const target = await createUploadTarget({
    userId: response.locals.userId as string,
    filename: input.filename,
    contentType: input.contentType,
  });
  response.json({ target });
});

const exportSchema = z.object({
  format: z.enum(["pdf", "docx", "pptx", "png"]),
  template: z.enum(["classic", "modern", "minimal"]).default("classic"),
});

documentsRouter.post("/:id/export", async (request, response, next) => {
  try {
    const documentId = request.params.id;
    const input = exportSchema.parse(request.body);

    const result = await query<{
      id: string;
      user_id: string;
      title: string;
      content: string;
      type: string;
    }>(
      `SELECT id, user_id, title, content, type FROM documents WHERE id = $1`,
      [documentId],
    );
    const document = result.rows[0];
    if (!document) {
      response.status(404).json({ error: "Document not found" });
      return;
    }
    if (document.user_id !== (response.locals.userId as string)) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }

    const rendered = await renderDocument(
      {
        title: document.title,
        sections: contentToExportSections(document.content),
      },
      input.format,
      input.template,
    );

    await query(
      `INSERT INTO ai_task_runs (agent, model, provider, prompt_version, output_reference, status)
       VALUES ('document_export', $1, 'internal', '1.0', $2, 'succeeded')`,
      [`export:${input.format}`, document.id],
    );

    response
      .setHeader("Content-Type", rendered.mimeType)
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${slugify(document.title)}.${rendered.extension}"`,
      )
      .send(rendered.body);
  } catch (error) {
    next(error);
  }
});
