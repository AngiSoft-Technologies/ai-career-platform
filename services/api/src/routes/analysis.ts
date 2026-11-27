import { Router } from "express";
import { z } from "zod";
import { getProfile } from "../services/profile.js";
import { getOpportunity } from "../services/opportunities.js";
import { analyseApplicationPage } from "../services/application/analyzer.js";
import {
  approvePreparation,
  ensurePreparation,
  getPreparationByApplication,
  getPreparationByOpportunity,
  savePreparationInputs,
} from "../services/application/preparation.js";
import {
  cancelSubmissionRun,
  createSubmissionRun,
  getLatestSubmission,
  resumeSubmissionRun,
} from "../services/application/submission.js";
import { ensureBlueprint } from "../services/applications.js";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";
import { enqueuePreparationJob } from "../worker/index.js";

export const analysisRouter = Router();

const preparationSchema = z.object({
  sourceCvDocumentId: z.string().uuid().optional(),
  sourceCoverLetterDocumentId: z.string().uuid().optional(),
});

async function enqueuePreparation(
  preparationId: string,
  version: number,
  attemptCount = 0,
  nextAttemptAt?: string,
): Promise<void> {
  await enqueuePreparationJob(preparationId, version, {
    attemptCount,
    notBefore: nextAttemptAt ? new Date(nextAttemptAt) : undefined,
  });
}

/**
 * Queues a complete, job-specific application package.
 *
 * The request is deliberately cheap: research, form analysis, and document
 * generation happen in the worker. The browser can therefore keep the
 * opportunity page useful while the package is being prepared.
 */
analysisRouter.post("/prepare/:opportunityId", async (request, response, next) => {
  try {
    const opportunityId = z.string().uuid().parse(request.params.opportunityId);
    const userId = response.locals.userId as string;
    const input = preparationSchema.parse(request.body ?? {});

    const result = await ensurePreparation(userId, opportunityId, input);
    if (result.shouldQueue) {
      await enqueuePreparation(
        result.preparation.id,
        result.preparation.version,
        result.attemptCount,
        result.nextAttemptAt,
      );
    }
    response.status(result.shouldQueue ? 202 : 200).json({
      preparation: result.preparation,
    });
  } catch (error) {
    next(error);
  }
});

analysisRouter.get("/prepare/:opportunityId", async (request, response, next) => {
  try {
    const opportunityId = z.string().uuid().parse(request.params.opportunityId);
    const userId = response.locals.userId as string;
    const preparation = await getPreparationByOpportunity(userId, opportunityId);
    // "Not prepared yet" is the normal state on first open, not an error.
    response.json({ preparation: preparation ?? null });
  } catch (error) {
    next(error);
  }
});

analysisRouter.post("/prepare/:opportunityId/refresh", async (request, response, next) => {
  try {
    const opportunityId = z.string().uuid().parse(request.params.opportunityId);
    const userId = response.locals.userId as string;
    const input = preparationSchema.parse(request.body ?? {});
    const result = await ensurePreparation(userId, opportunityId, {
      ...input,
      refresh: true,
    });
    if (result.shouldQueue) {
      await enqueuePreparation(
        result.preparation.id,
        result.preparation.version,
        result.attemptCount,
        result.nextAttemptAt,
      );
    }
    response.status(202).json({ preparation: result.preparation });
  } catch (error) {
    next(error);
  }
});

analysisRouter.get("/:id/preparation", async (request, response, next) => {
  try {
    const applicationId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const preparation = await getPreparationByApplication(userId, applicationId);
    // The applications page opens this before preparation is queued.
    response.json({ preparation: preparation ?? null });
  } catch (error) {
    next(error);
  }
});

analysisRouter.put("/:id/preparation/inputs", async (request, response, next) => {
  try {
    const applicationId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const input = z.object({
      inputs: z.array(z.object({
        key: z.string().min(1).max(240),
        value: z.string().max(20_000),
      })).max(100),
    }).parse(request.body);

    const preparation = await savePreparationInputs(
      userId,
      applicationId,
      input.inputs,
    );
    if (preparation.status === "QUEUED") {
      await enqueuePreparation(preparation.id, preparation.version);
    }
    response.json({ preparation });
  } catch (error) {
    next(error);
  }
});

analysisRouter.post("/:id/preparation/approve", async (request, response, next) => {
  try {
    const applicationId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const preparation = await approvePreparation(userId, applicationId);
    response.json({ preparation });
  } catch (error) {
    next(error);
  }
});

analysisRouter.post("/:id/submission", async (request, response, next) => {
  try {
    const applicationId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const input = z
      .object({
        consent: z.literal(true),
        guidedSession: z.boolean().optional(),
      })
      .parse(request.body);
    if (!input.consent) throw new Error("SUBMISSION_CONSENT_REQUIRED");

    // The guided browser workspace is a second, independently authenticated
    // way to drive a submission. Only waive the paired-extension requirement
    // when a live guidance session actually exists for this application.
    let guidedSession = false;
    if (input.guidedSession) {
      const active = await query<{ id: string }>(
        `SELECT id FROM application_guidance_sessions
          WHERE user_id = $1 AND application_id = $2
            AND status = ANY($3::text[]) AND ended_at IS NULL
          LIMIT 1`,
        [userId, applicationId, ["ACTIVE", "WAITING_FOR_HUMAN"]],
      );
      guidedSession = Boolean(active.rows[0]);
    }
    const run = await createSubmissionRun(userId, applicationId, { guidedSession });
    response.status(202).json({ run });
  } catch (error) {
    next(error);
  }
});

analysisRouter.get("/:id/submission", async (request, response, next) => {
  try {
    const applicationId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const run = await getLatestSubmission(userId, applicationId);
    response.json({ run });
  } catch (error) {
    next(error);
  }
});

analysisRouter.post("/:id/submission/resume", async (request, response, next) => {
  try {
    const applicationId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const input = z.object({
      values: z.record(z.string(), z.string()).optional(),
    }).parse(request.body ?? {});
    const run = await resumeSubmissionRun(userId, applicationId, input);
    response.json({ run });
  } catch (error) {
    next(error);
  }
});

analysisRouter.post("/:id/submission/cancel", async (request, response, next) => {
  try {
    const applicationId = z.string().uuid().parse(request.params.id);
    const userId = response.locals.userId as string;
    const cancelled = await cancelSubmissionRun(userId, applicationId);
    response.json({ cancelled });
  } catch (error) {
    next(error);
  }
});

/**
 * Compatibility endpoint for analysis-only callers. The durable preparation
 * workflow above is the primary path; this keeps the old request available
 * without pretending it generated a complete application package.
 */
analysisRouter.post("/:id/analyze", async (request, response, next) => {
  try {
    const applicationId = request.params.id;
    const userId = response.locals.userId as string;

    const application = await query<{
      id: string;
      opportunity_id: string;
      apply_url: string;
      title: string;
      application_method: string;
    }>(
      `SELECT a.id, a.opportunity_id, o.apply_url, o.title, o.application_method
         FROM applications a
         JOIN opportunities o ON o.id = a.opportunity_id
        WHERE a.id = $1 AND a.user_id = $2`,
      [applicationId, userId],
    );

    const row = application.rows[0];
    if (!row) {
      response.status(404).json({ error: "Application not found" });
      return;
    }

    const [profile, opportunity] = await Promise.all([
      getProfile(userId),
      getOpportunity(row.opportunity_id),
    ]);
    if (!profile || !opportunity) {
      response.status(404).json({ error: "Profile or opportunity not found" });
      return;
    }

    const analysis = await analyseApplicationPage({
      applyUrl: opportunity.applyUrl,
      applicationMethod: opportunity.applicationMethod,
      profile,
    });

    await ensureBlueprint(opportunity.id);
    await query(
      `UPDATE application_blueprints
          SET method = $2,
              platform = $3,
              application_url = $4,
              required_documents = $5,
              field_map = $6,
              user_input_required = $7,
              email_recipient = $8,
              email_subject = $9,
              instructions = $10,
              analyzed_at = now()
        WHERE opportunity_id = $1`,
      [
        opportunity.id,
        analysis.method === "ats" ? "ats" : analysis.method === "email" ? "email" : "website",
        analysis.platform,
        analysis.analysisUrl,
        analysis.requiredDocuments,
        JSON.stringify(Object.fromEntries(
          analysis.fields.map((field) => [field.key, field.suggestedValue ?? ""]),
        )),
        JSON.stringify(analysis.fields.filter((field) => field.required && !field.suggestedValue)),
        analysis.emailRecipient ?? null,
        analysis.emailSubject ?? null,
        analysis.instructions.join("\n"),
      ],
    );

    broadcast(
      "application.analyzed",
      {
        applicationId,
        platform: analysis.platform,
        fieldsDetected: analysis.fields.length,
        userInputRequired: analysis.requiresUserInput.length,
      },
      userId,
    );

    await query(
      `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
       VALUES ('application.analyzed', 'application', $1, $2)`,
      [applicationId, JSON.stringify({ platform: analysis.platform })],
    );

    response.json({ analysis });
  } catch (error) {
    next(error);
  }
});
