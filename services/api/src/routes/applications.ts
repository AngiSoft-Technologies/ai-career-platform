import { Router } from "express";
import type { ApplicationStatus } from "@angisoft/mboqara-contracts";
import { z } from "zod";
import { cacheDelByPrefix } from "../db/redis.js";
import { broadcast } from "../realtime/hub.js";
import {
  createApplication,
  ensureBlueprint,
  listApplications,
  updateApplicationStatus,
} from "../services/applications.js";
import { humanizeStatus, notify } from "../services/notifications.js";
import { query } from "../db/pool.js";
import { getUserPermissions } from "../services/rbac/index.js";

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

applicationsRouter.get("/", async (request, response) => {
  // A pipeline of a few rows and a pipeline of a few thousand are the same
  // question to this route: one page and the number of rows that match, so
  // the pager can say where it is. The filter is applied by the database,
  // not by the browser, so the tab counts and the list agree.
  const filters = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
      status: z.string().max(40).optional(),
      // A support desk looks up another person's pipeline. That is the one
      // case this route answers for a user other than the caller, and it is
      // gated on the support permission rather than on `applications:read`,
      // which every candidate also holds.
      userId: z.string().uuid().optional(),
    })
    .parse(request.query);

  const callerId = response.locals.userId as string;
  let mayLookUpOthers = false;
  if (filters.userId) {
    // The permission is read for this request rather than trusted from the
    // caller: only the roles that hold `support:read` may look at another
    // person's pipeline.
    const callerPermissions = await getUserPermissions(callerId);
    mayLookUpOthers = callerPermissions.includes("support:read");
  }
  const ownerId = filters.userId && mayLookUpOthers ? filters.userId : callerId;

  const page = await listApplications(ownerId, filters);
  response.json({
    items: page.items,
    applications: page.items,
    total: page.total,
    statusCounts: page.statusCounts,
    // The desk is told whose pipeline it is looking at, so a lookup that
    // fell back to the agent's own rows is visible rather than silent.
    userId: ownerId,
  });
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
  await notify(userId, {
    type: "application",
    title: "Application tracked",
    body: "Next step: tailor your CV for this role.",
  });
  response.status(201).json({ application });
});

applicationsRouter.get("/:id/workspace", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const applicationId = z.string().uuid().parse(request.params.id);

    const owned = await query<{
      opportunity_id: string;
      status: string;
      version: number;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT opportunity_id, status, version, created_at, updated_at
         FROM applications WHERE id = $1 AND user_id = $2`,
      [applicationId, userId],
    );
    const row = owned.rows[0];
    if (!row) {
      response.status(404).json({ error: "Application not found" });
      return;
    }

    const blueprint = await ensureBlueprint(row.opportunity_id);

    // The posting is read through the columns the catalogue actually has.
    // This query used to name `required_skills`, `responsibilities`,
    // `qualifications` and `benefits` — columns that were folded into the
    // description and the skills join — so the workspace returned a 500
    // for every application until it was pointed back at the live schema.
    const opportunity = await query(
      `SELECT o.id, o.title, o.company_id, o.apply_url, o.application_method, o.platform,
              o.description, o.salary_min, o.salary_max, o.currency, o.posted_at, o.status,
              o.city, o.country, o.work_mode, o.seniority, o.employment_type,
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
        // The application's own row travels with the workspace: the page
        // moves the status with an optimistic version, and it used to have
        // to download every application the user has ever made to learn
        // this one's version.
        status: row.status,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
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
  await notify(userId, {
    type: "application",
    title: `Application moved to ${humanizeStatus(application.status)}`,
    body: "Open the application to see what changed and what to do next.",
  });
  response.json({ application });
});
