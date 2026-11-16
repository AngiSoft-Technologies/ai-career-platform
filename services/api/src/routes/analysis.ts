import { Router } from "express";
import { getProfile } from "../services/profile.js";
import { getOpportunity } from "../services/opportunities.js";
import { analyseApplicationPage } from "../services/application/analyzer.js";
import { getOrGenerateTailoredDocuments, generateTailoredDocuments } from "../services/documents/tailor.js";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";

export const analysisRouter = Router();

/**
 * PROACTIVE: Prepares complete application package when user views an opportunity.
 * Called automatically by the web app on opportunity detail page load.
 * Returns analysis + tailored CV + cover letter + employer intelligence.
 */
analysisRouter.post("/prepare/:opportunityId", async (request, response, next) => {
  try {
    const opportunityId = request.params.opportunityId;
    const userId = response.locals.userId as string;

    // Verify user has access to this opportunity (it exists and is active)
    const oppResult = await query(
      `SELECT id, title, company_name, apply_url, application_method, description,
              skills, seniority, employment_type, city, country, company_website
         FROM opportunities
        WHERE id = $1 AND status = 'active'`,
      [opportunityId],
    );

    const opportunity = oppResult.rows[0];
    if (!opportunity) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }

    const profile = await getProfile(userId);
    if (!profile) {
      response.status(404).json({ error: "Profile not found" });
      return;
    }

    // Run the full preparation pipeline in parallel
    const [analysis, documents] = await Promise.all([
      analyseApplicationPage({
        applyUrl: opportunity.apply_url,
        applicationMethod: opportunity.application_method,
        profile,
      }),
      getOrGenerateTailoredDocuments({
        userId,
        opportunityId,
        profile,
        opportunity,
      }),
    ]);

    // Get employer intelligence (cached)
    const employerIntel = await getEmployerIntelligence(opportunity);

    // Store analysis in blueprint for the apply tab
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
        opportunityId,
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

    response.json({
      analysis,
      documents,
      employerIntel,
      ready: true,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Forces a refresh of the preparation (user clicked "Regenerate").
 */
analysisRouter.post("/prepare/:opportunityId/refresh", async (request, response, next) => {
  try {
    const opportunityId = request.params.opportunityId;
    const userId = response.locals.userId as string;

    const oppResult = await query(
      `SELECT * FROM opportunities WHERE id = $1 AND status = 'active'`,
      [opportunityId],
    );
    const opportunity = oppResult.rows[0];
    if (!opportunity) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }

    const profile = await getProfile(userId);
    if (!profile) {
      response.status(404).json({ error: "Profile not found" });
      return;
    }

    // Force refresh - bypass cache
    const [analysis, documents] = await Promise.all([
      analyseApplicationPage({
        applyUrl: opportunity.apply_url,
        applicationMethod: opportunity.application_method,
        profile,
      }),
      generateTailoredDocuments({ profile, opportunity }),
    ]);

    const employerIntel = await getEmployerIntelligence(opportunity);

    await query(
      `UPDATE application_blueprints
          SET method = $2, platform = $3, application_url = $4,
              required_documents = $5, field_map = $6, user_input_required = $7,
              email_recipient = $8, email_subject = $9, instructions = $10,
              analyzed_at = now()
        WHERE opportunity_id = $1`,
      [
        opportunityId,
        analysis.method === "ats" ? "ats" : analysis.method === "email" ? "email" : "website",
        analysis.platform,
        analysis.analysisUrl,
        analysis.requiredDocuments,
        JSON.stringify(
          analysis.fields
            .filter((f) => f.suggestedValue)
            .map((f) => ({ key: f.key, label: f.label, value: f.suggestedValue })),
        ),
        analysis.requiresUserInput,
        analysis.emailRecipient ?? null,
        analysis.emailSubject ?? null,
        analysis.instructions,
      ],
    );

    response.json({ analysis, documents, employerIntel, ready: true });
  } catch (error) {
    next(error);
  }
});

async function getEmployerIntelligence(opportunity: any): Promise<any> {
  // Check cache first (7 days)
  const cached = await query(
    `SELECT payload FROM employer_intelligence_cache
     WHERE company_name = $1 AND cached_at > now() - interval '7 days'
     ORDER BY cached_at DESC LIMIT 1`,
    [opportunity.company_name],
  );
  if (cached.rows[0]?.payload) {
    return cached.rows[0].payload;
  }

  // Return minimal for now - full crawl runs async via background job
  return {
    companyName: opportunity.company_name,
    techStack: [],
    cultureSignals: [],
    interviewProcess: [],
    recentNews: [],
    glassdoorRating: null,
    employeeCount: null,
    fundingStage: null,
  };
}

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
