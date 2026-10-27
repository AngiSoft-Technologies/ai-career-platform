import { Router } from "express";
import { getProfile } from "../services/profile.js";
import { getOpportunity } from "../services/opportunities.js";
import { analyseApplicationPage } from "../services/application/analyzer.js";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";

export const analysisRouter = Router();

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

    const [profile] = await Promise.all([
      getProfile(userId),
      Promise.resolve(row),
    ]);

    const analysis = await analyseApplicationPage({
      applyUrl: row.apply_url,
      applicationMethod: row.application_method,
      profile,
    });

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
        row.opportunity_id,
        analysis.method === "ats" ? "ats" : analysis.method === "email" ? "email" : "website",
        analysis.platform,
        analysis.analysisUrl,
        analysis.requiredDocuments,
        JSON.stringify(
          analysis.fields
            .filter((field) => field.suggestedValue)
            .map((field) => ({ key: field.key, label: field.label, value: field.suggestedValue })),
        ),
        analysis.requiresUserInput,
        analysis.emailRecipient ?? null,
        analysis.emailSubject ?? null,
        analysis.instructions,
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
