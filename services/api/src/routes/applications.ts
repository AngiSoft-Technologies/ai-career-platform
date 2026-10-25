import { Router } from "express";
import type { ApplicationStatus } from "@angisoft/job-radar-contracts";
import { z } from "zod";
import { cacheDelByPrefix } from "../db/redis.js";
import { broadcast } from "../realtime/hub.js";
import {
  createApplication,
  ensureBlueprint,
  listApplications,
  updateApplicationStatus,
} from "../services/applications.js";
import { query } from "../db/pool.js";

const statuses = [
  "DISCOVERED",
  "SHORTLISTED",
  "ANALYZED",
  "APPLICATION_PREPARATION",
  "READY_TO_APPLY",
  "APPLIED",
  "ACKNOWLEDGED",
  "NO_RESPONSE",
  "SCREENING",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
  "FAILED",
] as const;

const createSchema = z.object({
  opportunityId: z.string().uuid(),
  status: z.enum(statuses).optional(),
});

const statusSchema = z.object({
  status: z.enum(statuses),
  version: z.number().int().min(1),
});

export const applicationsRouter = Router();

applicationsRouter.get("/", async (_request, response) => {
  const applications = await listApplications(
    response.locals.userId as string,
  );
  response.json({ items: applications, applications });
});

applicationsRouter.post("/", async (request, response) => {
  const userId = response.locals.userId as string;
  const input = createSchema.parse(request.body);
  const application = await createApplication(
    userId,
    input.opportunityId,
    input.status as ApplicationStatus | undefined,
  );
  await cacheDelByPrefix(`opportunities:${userId}:`);
  response.status(201).json({ application });
});

applicationsRouter.get("/:id/workspace", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const applicationId = z.string().uuid().parse(request.params.id);

    const owned = await query<{ opportunity_id: string }>(
      "SELECT opportunity_id FROM applications WHERE id = $1 AND user_id = $2",
      [applicationId, userId],
    );
    const row = owned.rows[0];
    if (!row) {
      response.status(404).json({ error: "Application not found" });
      return;
    }

    const blueprint = await ensureBlueprint(row.opportunity_id);

    const opportunity = await query(
      `SELECT o.id, o.title, o.company_id, o.apply_url, o.application_method, o.platform,
              o.description, o.required_skills, o.responsibilities, o.qualifications,
              o.benefits, o.salary_min, o.salary_max, o.currency, o.posted_at, o.status,
              c.name AS company_name
         FROM opportunities o
         LEFT JOIN companies c ON c.id = o.company_id
        WHERE o.id = $1`,
      [row.opportunity_id],
    );

    const documents = await query(
      `SELECT id, type, title, created_at
         FROM documents
        WHERE user_id = $1 AND opportunity_id = $2
        ORDER BY created_at DESC`,
      [userId, row.opportunity_id],
    );

    const followups = await query(
      `SELECT id, due_at, status, channel, note
         FROM followups
        WHERE user_id = $1 AND application_id = $2
        ORDER BY due_at ASC`,
      [userId, applicationId],
    );

    response.json({
      workspace: {
        applicationId,
        opportunityId: row.opportunity_id,
        opportunity: opportunity.rows[0] ?? null,
        blueprint,
        documents: documents.rows,
        followups: followups.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.patch("/:id/status", async (request, response) => {
  const userId = response.locals.userId as string;
  const input = statusSchema.parse(request.body);
  const application = await updateApplicationStatus(
    userId,
    request.params.id,
    input.status,
    input.version,
  );

  broadcast(
    "application.status",
    {
      applicationId: application.id,
      status: application.status,
    },
    userId,
  );
  await cacheDelByPrefix(`opportunities:${userId}:`);
  response.json({ application });
});
