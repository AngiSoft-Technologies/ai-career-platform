import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";
import { contentToExportSections, renderDocument } from "../services/documents/export.js";
import { slugify } from "../services/ingestion/pipeline.js";
import { validateDocumentForAts, validateRequestSchema } from "../services/documents/validate.js";
import { runAtsVerification } from "../services/documents/ats-agent.js";
import { importResume } from "../services/documents/extract.js";
import {
  generateDocument,
  listDocuments,
  prepareDocumentTailoring,
} from "../services/documents.js";
import { createUploadTarget } from "../services/storage.js";
import { humanizeStatus, notify } from "../services/notifications.js";
import {
  DEFAULT_COVER_LETTER_TEMPLATE_KEY,
  DEFAULT_RESUME_TEMPLATE_KEY,
  FALLBACK_COVER_LETTER_TEMPLATES,
  FALLBACK_RESUME_TEMPLATES,
} from "@angisoft/mboqara-contracts";

const generateSchema = z.object({
  opportunityId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  type: z.enum(["cv", "cover_letter", "application_email", "answer"]),
  // Key from `resume_templates` or `cover_letter_templates`. Omitted means the
  // service picks the default for the document type.
  templateKey: z.string().min(1).max(120).optional(),
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

// The catalogue lives in the database; these shared fallbacks only cover a
// failed catalogue read and must stay in sync with the 020 migration.

documentsRouter.get("/templates", async (_request, response, next) => {
  try {
    interface ResumeRow {
      key: string;
      label: string;
      category: string;
      description: string;
      ats_safe: boolean;
      accent: string;
      sort_order: number;
      layout_definition: Record<string, unknown> | null;
    }
    interface CoverRow {
      key: string;
      label: string;
      tone: string;
      description: string;
      sort_order: number;
      layout_definition: Record<string, unknown> | null;
    }

    let resumeRows: ResumeRow[] = [];
    let coverRows: CoverRow[] = [];
    try {
      resumeRows = (
        await query<ResumeRow>(
          `SELECT key, label, category, description, ats_safe, accent, sort_order, layout_definition
             FROM resume_templates WHERE active = true ORDER BY sort_order, label`,
        )
      ).rows;
    } catch {
      resumeRows = [];
    }
    try {
      coverRows = (
        await query<CoverRow>(
          `SELECT key, label, tone, description, sort_order, layout_definition
             FROM cover_letter_templates WHERE active = true ORDER BY sort_order, label`,
        )
      ).rows;
    } catch {
      coverRows = [];
    }

    response.json({
      resume:
        resumeRows.length > 0
          ? resumeRows.map((row) => ({
              key: row.key,
              label: row.label,
              category: row.category,
              description: row.description,
              atsSafe: row.ats_safe,
              accent: row.accent,
              sortOrder: row.sort_order,
              layoutDefinition: row.layout_definition ?? {},
            }))
          : [...FALLBACK_RESUME_TEMPLATES],
      coverLetter:
        coverRows.length > 0
          ? coverRows.map((row) => ({
              key: row.key,
              label: row.label,
              tone: row.tone,
              description: row.description,
              sortOrder: row.sort_order,
              layoutDefinition: row.layout_definition ?? {},
            }))
          : [...FALLBACK_COVER_LETTER_TEMPLATES],
    });
  } catch (error) {
    next(error);
  }
});

const createDocumentSchema = z.object({
  type: z.enum(["cv", "cover_letter", "application_email", "answer"]).default("cv"),
  title: z.string().min(1).max(240),
  content: z.string().max(200_000).default(""),
  template: z.string().min(1).max(120).optional(),
});

documentsRouter.post("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = createDocumentSchema.parse(request.body ?? {});
    const inserted = await query<{
      id: string;
      type: string;
      title: string;
      content: string;
      template: string;
      created_at: Date;
    }>(
      `INSERT INTO documents (user_id, type, title, content, origin, template)
       VALUES ($1, $2, $3, $4, 'manual', $5)
       RETURNING id, type, title, content, template, created_at`,
      [
        userId,
        input.type,
        input.title,
        input.content,
        input.template ?? DEFAULT_RESUME_TEMPLATE_KEY,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("DOCUMENT_CREATE_FAILED");

    void runAtsVerification({
      userId,
      documentId: row.id,
      content: row.content,
    }).catch(() => undefined);

    response.status(201).json({
      document: {
        id: row.id,
        type: row.type,
        title: row.title,
        content: row.content,
        template: row.template,
        createdAt: row.created_at.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/generate", async (request, response) => {
  const input = generateSchema.parse(request.body);
  const document = await generateDocument({
    userId: response.locals.userId as string,
    opportunityId: input.opportunityId,
    applicationId: input.applicationId,
    type: input.type,
    templateKey: input.templateKey,
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
  template: z.string().min(1).max(120).optional(),
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
      `SELECT id, opportunity_id, parent_document_id, type, title, content, template, created_at
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
      template: row.template,
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
              content = COALESCE($4, content),
              template = COALESCE($5, template)
        WHERE id = $1 AND user_id = $2
        RETURNING id, opportunity_id, type, title, content, template, created_at`,
      [
        documentId,
        response.locals.userId as string,
        input.title ?? null,
        input.content ?? null,
        input.template ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      response.status(404).json({ error: "Document not found" });
      return;
    }
    broadcast("document.updated", { documentId }, response.locals.userId as string);
    if (input.content !== undefined) {
      void runAtsVerification({
        userId: response.locals.userId as string,
        documentId,
        opportunityId: row.opportunity_id ?? null,
        content: input.content,
      })
        .then((report) =>
          broadcast(
            "document.ats.ready",
            { documentId, score: report.score, grade: report.grade },
            response.locals.userId as string,
          ),
        )
        .catch(() => undefined);
    }
    response.json({
      id: row.id,
      opportunityId: row.opportunity_id,
      type: row.type,
      title: row.title,
      content: row.content,
      template: row.template,
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
      template: string | null;
    }>(
      `SELECT opportunity_id, parent_document_id, application_id, type, title, content, template
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
      `INSERT INTO documents (user_id, opportunity_id, application_id, parent_document_id, type, title, content, template)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, opportunity_id AS "opportunityId", parent_document_id AS "parentDocumentId", type, title, content, created_at AS "createdAt"`,
      [response.locals.userId as string, opportunityId, applicationId, row.parent_document_id ?? documentId, row.type,
        input.title ?? `${row.title} — tailored copy`, input.content ?? row.content,
        row.template ?? DEFAULT_RESUME_TEMPLATE_KEY],
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

const importSchema = z.object({
  storageKey: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
});

documentsRouter.post("/import", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = importSchema.parse(request.body);

    if (!input.storageKey.startsWith(`users/${userId}/`)) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await importResume({
      userId,
      storageKey: input.storageKey,
      filename: input.filename,
      contentType: input.contentType,
    });

    broadcast(
      "document.generated",
      { documentId: result.document.id, type: "cv" },
      userId,
    );
    await notify(userId, {
      type: "document",
      title: "Your resume is ready",
      body: "We imported your resume and ran an ATS check. Review the suggestions before you apply.",
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

documentsRouter.get("/:id/ats", async (request, response, next) => {
  try {
    const documentId = z.string().uuid().parse(request.params.id);
    const result = await query(
      `SELECT score, grade, passed, verdict, outcome, issues, matched_keywords,
              missing_keywords, keyword_coverage, sections, metrics, created_at
         FROM ats_reports
        WHERE document_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [documentId, response.locals.userId as string],
    );
    const row = result.rows[0];
    if (!row) {
      response.json({ report: null });
      return;
    }
    response.json({
      report: {
        score: Number(row.score),
        grade: row.grade,
        passed: row.passed,
        verdict: row.verdict,
        outcome: row.outcome,
        issues: row.issues,
        matchedKeywords: row.matched_keywords,
        missingKeywords: row.missing_keywords,
        keywordCoverage: Number(row.keyword_coverage),
        sections: row.sections,
        metrics: row.metrics,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/:id/ats/run", async (request, response, next) => {
  try {
    const documentId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const input = z
      .object({
        keywords: z.array(z.string().max(80)).max(60).optional(),
        opportunityId: z.string().uuid().optional(),
      })
      .parse(request.body ?? {});
    const result = await query<{
      content: string;
      opportunity_id: string | null;
    }>(
      "SELECT content, opportunity_id FROM documents WHERE id = $1 AND user_id = $2",
      [documentId, userId],
    );
    const document = result.rows[0];
    if (!document) {
      response.status(404).json({ error: "Document not found" });
      return;
    }
    const report = await runAtsVerification({
      userId,
      documentId,
      opportunityId:
        input.opportunityId ?? document.opportunity_id,
      content: document.content,
      targetKeywords: input.keywords,
    });
    response.json({ report });
  } catch (error) {
    next(error);
  }
});

const exportSchema = z.object({
  format: z.enum(["pdf", "docx", "pptx", "png"]),
  template: z.string().min(1).max(120).default(DEFAULT_RESUME_TEMPLATE_KEY),
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
      template: string;
    }>(
      `SELECT id, user_id, title, content, type, template FROM documents WHERE id = $1`,
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

    // Fall back to the default only when the requested key has no catalogue
    // row, so an unknown or retired key still exports instead of rendering
    // unstyled. Valid keys are never rewritten.
    let templateKey = input.template || document.template || DEFAULT_RESUME_TEMPLATE_KEY;
    let style: {
      accent?: string;
      fontFamily?: string;
      margins?: "standard" | "narrow" | "comfortable";
      bodySize?: number;
      headingSize?: number;
    } = {};

    interface TemplateRow {
      accent: string;
      layout_definition: {
        typography?: {
          accentColor?: string;
          fontFamily?: string;
          bodySize?: number;
          headingSize?: number;
        };
        layout?: { margins?: string };
      } | null;
    }

    const lookupTemplate = async (key: string) =>
      (
        await query<TemplateRow>(
          "SELECT accent, layout_definition FROM resume_templates WHERE key = $1",
          [key],
        )
      ).rows[0];

    try {
      let row = await lookupTemplate(templateKey);
      if (!row && templateKey !== DEFAULT_RESUME_TEMPLATE_KEY) {
        templateKey = DEFAULT_RESUME_TEMPLATE_KEY;
        row = await lookupTemplate(templateKey);
      }
      if (row) {
        style = {
          accent: row.layout_definition?.typography?.accentColor ?? row.accent,
          fontFamily: row.layout_definition?.typography?.fontFamily,
          bodySize: row.layout_definition?.typography?.bodySize,
          headingSize: row.layout_definition?.typography?.headingSize,
          margins:
            row.layout_definition?.layout?.margins === "narrow"
              ? "narrow"
              : row.layout_definition?.layout?.margins === "comfortable"
                ? "comfortable"
                : "standard",
        };
      }
    } catch {
      style = {};
    }

    const rendered = await renderDocument(
      {
        title: document.title,
        sections: contentToExportSections(document.content),
      },
      input.format,
      templateKey,
      style,
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
