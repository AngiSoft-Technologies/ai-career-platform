import type {
  Application,
  ApplicationBlueprint,
  ApplicationStatus,
  Opportunity,
} from "@angisoft/mboqara-contracts";
import { APPLICATION_STATUS_TRANSITIONS } from "@angisoft/mboqara-contracts";
import { query } from "../db/pool.js";
import { getOpportunity } from "./opportunities.js";
import { enqueueWebhook } from "./webhooks/outbound.js";
import { logger } from "../logger.js";

interface BlueprintRow {
  id: string;
  opportunity_id: string;
  method: string;
  platform: string;
  application_url: string;
  required_documents: string[];
  fields: unknown;
  questions: unknown;
  instructions: string;
  updated_at: Date;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: string;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  /** Present on the list query, which joins the posting it refers to. */
  opportunity_title?: string | null;
  company_name?: string | null;
}

export interface ApplicationWithRole extends Application {
  /** What the posting is called, so a list does not have to re-fetch the feed. */
  opportunityTitle?: string | null;
  companyName?: string | null;
}

function mapBlueprint(row: BlueprintRow): ApplicationBlueprint {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    method: row.method as ApplicationBlueprint["method"],
    platform: row.platform,
    applicationUrl: row.application_url,
    requiredDocuments: row.required_documents,
    fields: Array.isArray(row.fields) ? (row.fields as string[]) : [],
    questions: Array.isArray(row.questions) ? (row.questions as string[]) : [],
    instructions: row.instructions,
    generatedAt: row.updated_at.toISOString(),
  };
}

function mapApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    userId: row.user_id,
    opportunityId: row.opportunity_id,
    status: row.status as ApplicationStatus,
    appliedAt: row.applied_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

function buildBlueprint(opportunity: Opportunity): {
  method: string;
  platform: string;
  applicationUrl: string;
  requiredDocuments: string[];
  fields: string[];
  questions: string[];
  instructions: string;
} {
  const isEmail = opportunity.applicationMethod === "email";
  const isAts = ["greenhouse", "lever", "workday", "ashby", "oracle"].includes(
    opportunity.platform,
  );

  return {
    method: opportunity.applicationMethod,
    platform: opportunity.platform,
    applicationUrl: opportunity.applyUrl,
    requiredDocuments: isEmail ? ["CV", "Cover Letter"] : ["CV"],
    fields: isEmail
      ? ["to", "subject", "message", "attachments"]
      : [
          "first_name",
          "last_name",
          "email",
          "phone",
          "education",
          "experience",
        ],
    questions: isAts
      ? [
          "Why do you want to work here?",
          "Describe your most relevant experience.",
          "What are your salary expectations?",
        ]
      : isEmail
        ? ["Cover letter message"]
        : ["Tell us about yourself"],
    instructions: isEmail
      ? `Email your application to the hiring team using the subject line "Application for ${opportunity.title}". Review the generated cover letter and CV before sending.`
      : `Apply through the official ${opportunity.companyName} application page. Review the generated documents and answers before submitting. mboqara never submits on your behalf.`,
  };
}

export async function ensureBlueprint(
  opportunityId: string,
): Promise<ApplicationBlueprint> {
  const existing = await query<BlueprintRow>(
    "SELECT * FROM application_blueprints WHERE opportunity_id = $1",
    [opportunityId],
  );
  if (existing.rows[0]) return mapBlueprint(existing.rows[0]);

  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");

  const blueprint = buildBlueprint(opportunity);
  const inserted = await query<BlueprintRow>(
    `INSERT INTO application_blueprints (
       opportunity_id, method, platform, application_url, required_documents,
       fields, questions, instructions
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      opportunityId,
      blueprint.method,
      blueprint.platform,
      blueprint.applicationUrl,
      blueprint.requiredDocuments,
      JSON.stringify(blueprint.fields),
      JSON.stringify(blueprint.questions),
      blueprint.instructions,
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("BLUEPRINT_CREATE_FAILED");
  return mapBlueprint(row);
}

export async function getWorkspace(
  opportunityId: string,
): Promise<ApplicationBlueprint> {
  return ensureBlueprint(opportunityId);
}

export async function getApplicationBlueprint(
  userId: string,
  applicationId: string,
): Promise<ApplicationBlueprint> {
  const application = await query<{ opportunity_id: string }>(
    "SELECT opportunity_id FROM applications WHERE id = $1 AND user_id = $2",
    [applicationId, userId],
  );
  const row = application.rows[0];
  if (!row) throw new Error("APPLICATION_NOT_FOUND");
  return ensureBlueprint(row.opportunity_id);
}

export interface ApplicationListFilters {
  /** One page of the pipeline, not every row the user has ever made. */
  limit?: number;
  offset?: number;
  status?: string;
}

export interface ApplicationPage {
  items: ApplicationWithRole[];
  /** How many applications match the filter — what the pager counts. */
  total: number;
  /** Every stage's count, for tabs that filter by status. */
  statusCounts: Record<string, number>;
}

export async function listApplications(
  userId: string,
  filters: ApplicationListFilters = {},
): Promise<ApplicationPage> {
  // The posting's title and company are joined in. The web app used to map
  // them from the first hundred roles in the feed, so an application to role
  // number a hundred and one rendered as "Opportunity" — a list that lies
  // about what it contains.
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  const clauses = ["a.user_id = $1"];
  const values: unknown[] = [userId];
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`a.status = $${values.length}`);
  }

  const [items, counted, grouped] = await Promise.all([
    query<ApplicationRow>(
      `SELECT a.*, o.title AS opportunity_title, c.name AS company_name
         FROM applications a
         JOIN opportunities o ON o.id = a.opportunity_id
         JOIN companies c ON c.id = o.company_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY a.updated_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM applications a
        WHERE ${clauses.join(" AND ")}`,
      values,
    ),
    // The pipeline tabs count every stage, so the numbers on them are the
    // whole pipeline rather than the page in front of the reader.
    query<{ status: string; count: string }>(
      `SELECT a.status, count(*)::text AS count
         FROM applications a
        WHERE a.user_id = $1
        GROUP BY a.status`,
      [userId],
    ),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of grouped.rows) statusCounts[row.status] = Number(row.count);

  return {
    items: items.rows.map((row) => ({
      ...mapApplication(row),
      opportunityTitle: row.opportunity_title ?? null,
      companyName: row.company_name ?? null,
    })),
    total: Number(counted.rows[0]?.count ?? 0),
    statusCounts,
  };
}

export async function createApplication(
  userId: string,
  opportunityId: string,
  initialStatus: ApplicationStatus = "SHORTLISTED",
): Promise<Application> {
  const blueprint = await ensureBlueprint(opportunityId);

  const inserted = await query<ApplicationRow>(
    `INSERT INTO applications (user_id, opportunity_id, blueprint_id, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, opportunity_id) DO NOTHING
     RETURNING *`,
    [userId, opportunityId, blueprint.id, initialStatus],
  );

  const existing = inserted.rows[0]
    ? inserted.rows[0]
    : (
        await query<ApplicationRow>(
          "SELECT * FROM applications WHERE user_id = $1 AND opportunity_id = $2",
          [userId, opportunityId],
        )
      ).rows[0];

  if (!existing) throw new Error("APPLICATION_CREATE_FAILED");

  if (inserted.rows[0]) {
    await query(
      `INSERT INTO application_events (application_id, from_status, to_status, note)
       VALUES ($1, NULL, $2, 'Application created from workspace')`,
      [existing.id, existing.status],
    );
  }

  return mapApplication(existing);
}

export async function updateApplicationStatus(
  userId: string,
  applicationId: string,
  nextStatus: ApplicationStatus,
  expectedVersion: number,
): Promise<Application> {
  const current = await query<ApplicationRow>(
    "SELECT * FROM applications WHERE id = $1 AND user_id = $2",
    [applicationId, userId],
  );
  const row = current.rows[0];
  if (!row) throw new Error("APPLICATION_NOT_FOUND");

  const allowed = APPLICATION_STATUS_TRANSITIONS[row.status as ApplicationStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`INVALID_TRANSITION:${row.status}->${nextStatus}`);
  }

  const updated = await query<ApplicationRow>(
    `UPDATE applications
     SET status = $1,
         applied_at = CASE WHEN $1 = 'APPLIED' AND applied_at IS NULL THEN now() ELSE applied_at END,
         version = version + 1
     WHERE id = $2 AND user_id = $3 AND version = $4
     RETURNING *`,
    [nextStatus, applicationId, userId, expectedVersion],
  );
  const updatedRow = updated.rows[0];
  if (!updatedRow) throw new Error("VERSION_CONFLICT");

  await query(
    `INSERT INTO application_events (application_id, from_status, to_status)
     VALUES ($1, $2, $3)`,
    [applicationId, row.status, nextStatus],
  );

  // Notify the tenant's webhook subscribers. A webhook is a notification, not
  // a transaction participant: if the queue write fails, the status change
  // still stands and the failure is logged rather than surfaced to the user.
  try {
    await enqueueWebhook({
      event: "application.status_changed",
      userId,
      eventId: `${applicationId}:${nextStatus}:${updatedRow.version}`,
      data: {
        applicationId,
        fromStatus: row.status,
        toStatus: nextStatus,
        version: updatedRow.version,
        opportunityId: updatedRow.opportunity_id ?? null,
      },
    });
  } catch (error) {
    logger.warn(
      { applicationId, error: error instanceof Error ? error.message : String(error) },
      "Failed to queue application.status_changed webhook",
    );
  }

  return mapApplication(updatedRow);
}
