import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  ApplicationMissingInput,
  ApplicationPreparation,
  ApplicationPreparationDocumentIds,
  ApplicationPreparationStatus,
  ApplicationStatus,
} from "@angisoft/mboqara-contracts";
import { APPLICATION_STATUS_TRANSITIONS } from "@angisoft/mboqara-contracts";
import { query, withTransaction } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { broadcast } from "../../realtime/hub.js";
import { notify } from "../notifications.js";
import { getOpportunity } from "../opportunities.js";
import { getProfile } from "../profile.js";
import { ensureBlueprint } from "../applications.js";
import { enqueueWebhook } from "../webhooks/outbound.js";
import {
  DEFAULT_COVER_LETTER_TEMPLATE_KEY,
  DEFAULT_RESUME_TEMPLATE_KEY,
} from "@angisoft/mboqara-contracts";
import {
  generateTailoredDocuments,
  resolveTailoringSources,
} from "../documents/tailor.js";
import {
  analyseApplicationPage,
  type ApplicationAnalysis,
} from "./analyzer.js";
import { researchEmployer, type EmployerIntelligence } from "./research.js";
import { approvedDocumentSetFingerprint } from "./approval-fingerprint.js";
import { mergePreparationInputUpdates } from "./preparation-inputs.js";
import { draftApplicationAnswers, type DraftedApplicationAnswer } from "./answers.js";
import {
  answerInputKey,
  manualFieldInputKey,
  missingApplicationInputs,
} from "./policy.js";

interface PreparationRow {
  id: string;
  user_id: string;
  opportunity_id: string;
  application_id: string | null;
  source_cv_document_id: string | null;
  source_cover_letter_document_id: string | null;
  status: string;
  phase: string;
  version: number;
  source_fingerprint: string;
  attempt_count: number;
  next_attempt_at: Date | null;
  analysis: unknown;
  requirements: unknown;
  employer_intelligence: unknown;
  document_ids: unknown;
  missing_inputs: unknown;
  user_inputs: unknown;
  approved_at: Date | null;
  approved_fingerprint: string | null;
  approved_document_ids: unknown;
  prepared_at: Date | null;
  error_code: string | null;
  error_detail: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ApprovedPreparationRow {
  id: string;
  content: string;
  type: string;
  title: string;
  template: string;
}

interface ApplicationStatusRow {
  status: string;
  version: number;
  opportunity_id: string | null;
}

interface ApplicationStatusTransition {
  applicationId: string;
  userId: string;
  opportunityId: string | null;
  fromStatus: string;
  toStatus: ApplicationStatus;
  version: number;
}

interface ApprovalInvalidationPreparation {
  id: string;
  application_id: string | null;
  opportunity_id: string;
  status: string;
  phase: string;
}

interface ApprovalInvalidationResult {
  preparationId: string;
  opportunityId: string;
  status: string;
  transitions: ApplicationStatusTransition[];
}

export interface EditedPreparationDocument {
  id: string;
  opportunity_id: string | null;
  type: string;
  title: string;
  content: string;
  template: string;
  /** The structured document, when the editor has written one. */
  resume_data?: unknown;
  created_at: Date;
}

export interface PreparationResult {
  preparation: ApplicationPreparation;
  /** True when a worker job still has to be enqueued for this record. */
  shouldQueue: boolean;
  /** Attempts already spent on the current source fingerprint. */
  attemptCount: number;
  /** Earliest time at which the durable retry budget allows another attempt. */
  nextAttemptAt?: string;
}

export interface PreparationOptions {
  refresh?: boolean;
  applicationId?: string;
  sourceCvDocumentId?: string;
  sourceCoverLetterDocumentId?: string;
  /**
   * Maximum number of recorded attempts allowed for the current source
   * fingerprint. Manual callers leave this unset; the automatic scheduler
   * sets it so a permanently failing role cannot be retried forever.
   */
  maxAutomaticAttempts?: number;
  /** True when the caller is the automatic scheduler rather than the user. */
  automatic?: boolean;
}

interface PreparationClaim {
  preparation: PreparationRow;
  runId: string;
  attempt: number;
  version: number;
}

class PreparationSupersededError extends Error {
  constructor(preparationId: string) {
    super(`PREPARATION_SUPERSEDED:${preparationId}`);
    this.name = "PreparationSupersededError";
  }
}

export class PreparationAlreadyRunningError extends Error {
  constructor(preparationId: string) {
    super(`PREPARATION_ALREADY_RUNNING:${preparationId}`);
    this.name = "PreparationAlreadyRunningError";
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapPreparation(row: PreparationRow): ApplicationPreparation {
  const documentIds = objectValue(row.document_ids) as ApplicationPreparationDocumentIds;
  const missingInputs = arrayValue(row.missing_inputs).filter(
    (item): item is ApplicationMissingInput =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ApplicationMissingInput).key === "string",
  );
  const userInputs = objectValue(row.user_inputs);

  return {
    id: row.id,
    userId: row.user_id,
    opportunityId: row.opportunity_id,
    applicationId: row.application_id ?? undefined,
    status: row.status as ApplicationPreparationStatus,
    phase: row.phase,
    version: row.version,
    sourceFingerprint: row.source_fingerprint,
    analysis: objectValue(row.analysis),
    requirements: objectValue(row.requirements),
    employerIntelligence: objectValue(row.employer_intelligence),
    documentIds,
    missingInputs,
    userInputs: Object.fromEntries(
      Object.entries(userInputs).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    approvedAt: row.approved_at?.toISOString(),
    approvedFingerprint: row.approved_fingerprint ?? undefined,
    preparedDocumentIds: arrayValue(row.approved_document_ids).filter(
      (item): item is string => typeof item === "string",
    ),
    preparedAt: row.prepared_at?.toISOString(),
    errorCode: row.error_code ?? undefined,
    errorDetail: row.error_detail ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function opportunityFreshness(opportunityId: string): Promise<string> {
  const result = await query<{
    company_id: string;
    title: string;
    description: string;
    apply_url: string;
    application_method: string;
    platform: string;
    version: number;
  }>(
    `SELECT company_id, title, description, apply_url,
            application_method, platform, version
       FROM opportunities
      WHERE id = $1`,
    [opportunityId],
  );
  const row = result.rows[0];
  return row ? JSON.stringify(row) : "unknown";
}

function fingerprint(parts: Array<string | number | undefined>): string {
  return createHash("sha256")
    .update(parts.filter((part) => part !== undefined).join("|"))
    .digest("hex");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function preparationAttemptLimit(): number {
  return boundedInteger(
    Number(process.env.APPLICATION_PREPARATION_MAX_ATTEMPTS ?? 3),
    3,
    1,
    10,
  );
}

function preparationRetryBaseDelayMs(): number {
  return boundedInteger(
    Number(process.env.APPLICATION_PREPARATION_BACKOFF_MS ?? 30_000),
    30_000,
    1_000,
    10 * 60_000,
  );
}

function preparationRetryDelayMs(attemptNumber: number): number {
  const exponent = Math.min(Math.max(attemptNumber - 1, 0), 6);
  return Math.min(preparationRetryBaseDelayMs() * 2 ** exponent, 10 * 60_000);
}

function exhaustedPreparationCooldownMs(): number {
  return boundedInteger(
    Number(process.env.APPLICATION_PREPARATION_EXHAUSTED_COOLDOWN_MS ?? 60 * 60_000),
    60 * 60_000,
    1_000,
    24 * 60 * 60_000,
  );
}

/**
 * Creates or refreshes the one preparation record that belongs to a candidate
 * and an opportunity. The record is the durable answer to "what has the agent
 * prepared for this role?" — not a browser cache and not a generic resume.
 */
export async function ensurePreparation(
  userId: string,
  opportunityId: string,
  options: PreparationOptions = {},
): Promise<PreparationResult> {
  const [profile, opportunity] = await Promise.all([
    getProfile(userId),
    getOpportunity(opportunityId),
  ]);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");

  const sources = await resolveTailoringSources({
    userId,
    sourceCvDocumentId: options.sourceCvDocumentId,
    sourceCoverLetterDocumentId: options.sourceCoverLetterDocumentId,
  });
  const updatedAt = await opportunityFreshness(opportunityId);
  const sourceFingerprint = fingerprint([
    updatedAt,
    profile.version,
    profile.updatedAt,
    sources.cv?.updatedAt,
    sources.coverLetter?.updatedAt,
    options.sourceCvDocumentId,
    options.sourceCoverLetterDocumentId,
  ]);

  return withTransaction(async (client) => {
    const missingInputs: ApplicationMissingInput[] = sources.cv
      ? []
      : [{
          key: "resume",
          label: "Upload your resume",
          type: "file",
          reason: "The agent needs one source resume before it can tailor a package for this role.",
          required: true,
        }];
    const existing = await client.query<PreparationRow>(
      `SELECT * FROM application_preparations
        WHERE user_id = $1 AND opportunity_id = $2
        FOR UPDATE`,
      [userId, opportunityId],
    );
    let current = existing.rows[0];

    if (!current) {
      const inserted = await client.query<PreparationRow>(
        `INSERT INTO application_preparations (
           user_id, opportunity_id, application_id,
           source_cv_document_id, source_cover_letter_document_id,
           status, phase, version, source_fingerprint, missing_inputs
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9)
         ON CONFLICT (user_id, opportunity_id) DO NOTHING
         RETURNING *`,
        [
          userId,
          opportunityId,
          options.applicationId ?? null,
          sources.cv?.id ?? null,
          sources.coverLetter?.id ?? null,
          missingInputs.length ? "NEEDS_INPUT" : "QUEUED",
          missingInputs.length ? "waiting_for_resume" : "queued",
          sourceFingerprint,
          JSON.stringify(missingInputs),
        ],
      );
      const row = inserted.rows[0];
      if (row) {
        return {
          preparation: mapPreparation(row),
          shouldQueue: missingInputs.length === 0,
          attemptCount: row.attempt_count,
          nextAttemptAt: row.next_attempt_at?.toISOString(),
        };
      }

      // Another transaction won the unique (candidate, opportunity) insert
      // while this transaction was checking for an existing row. Read and lock
      // the winner, then apply the same freshness and retry rules below.
      const raced = await client.query<PreparationRow>(
        `SELECT * FROM application_preparations
          WHERE user_id = $1 AND opportunity_id = $2
          FOR UPDATE`,
        [userId, opportunityId],
      );
      current = raced.rows[0];
      if (!current) throw new Error("PREPARATION_CREATE_FAILED");
    }

    const sourceChanged = current.source_fingerprint !== sourceFingerprint;
    const failedStatus = current.status === "FAILED" || current.status === "STALE";
    const automatic = options.automatic === true;
    const attemptLimit = options.maxAutomaticAttempts ??
      preparationAttemptLimit();
    const automaticAttemptsExhausted =
      automatic && failedStatus && current.attempt_count >= attemptLimit;

    // A final worker failure remains resumable. Automatic retries consume the
    // same durable attempt budget across version fences, so a stale recovery
    // cannot reset an exhausted posting. An explicit user action starts a
    // fresh generation, and a changed source naturally starts a new budget.
    const mustRefresh = Boolean(options.refresh) ||
      sourceChanged ||
      (failedStatus && !automaticAttemptsExhausted);
    const resetAttemptBudget = Boolean(options.refresh) ||
      sourceChanged ||
      (failedStatus && !automatic);
    if (!mustRefresh) {
      if (
        automaticAttemptsExhausted &&
        (!current.next_attempt_at || current.next_attempt_at.getTime() <= Date.now())
      ) {
        const nextAttemptAt = new Date(Date.now() + exhaustedPreparationCooldownMs());
        await client.query(
          `UPDATE application_preparations
              SET next_attempt_at = $2
            WHERE id = $1`,
          [current.id, nextAttemptAt],
        );
        current.next_attempt_at = nextAttemptAt;
      }
      if (options.applicationId && current.application_id !== options.applicationId) {
        await client.query(
          `UPDATE application_preparations
              SET application_id = $2
            WHERE id = $1`,
          [current.id, options.applicationId],
        );
        current.application_id = options.applicationId;
      }
      return {
        preparation: mapPreparation(current),
        shouldQueue: current.status === "QUEUED",
        attemptCount: current.attempt_count,
        nextAttemptAt: current.next_attempt_at?.toISOString(),
      };
    }

    const updated = await client.query<PreparationRow>(
      `UPDATE application_preparations
          SET application_id = COALESCE($2, application_id),
              source_cv_document_id = $3,
              source_cover_letter_document_id = $4,
              status = $5,
              phase = $6,
              version = version + 1,
              source_fingerprint = $7,
              attempt_count = CASE WHEN $9::boolean THEN 0 ELSE attempt_count END,
              next_attempt_at = CASE WHEN $9::boolean THEN NULL ELSE next_attempt_at END,
              analysis = '{}'::jsonb,
              requirements = '{}'::jsonb,
              employer_intelligence = '{}'::jsonb,
              document_ids = '{}'::jsonb,
              missing_inputs = $8,
              approved_at = NULL,
              approved_fingerprint = NULL,
              approved_document_ids = '[]'::jsonb,
              error_code = NULL,
              error_detail = NULL,
              prepared_at = NULL
        WHERE id = $1
        RETURNING *`,
      [
        current.id,
        options.applicationId ?? null,
        sources.cv?.id ?? null,
        sources.coverLetter?.id ?? null,
        missingInputs.length ? "NEEDS_INPUT" : "QUEUED",
        missingInputs.length ? "waiting_for_resume" : "queued",
        sourceFingerprint,
        JSON.stringify(missingInputs),
        resetAttemptBudget,
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("PREPARATION_UPDATE_FAILED");
    return {
      preparation: mapPreparation(row),
      shouldQueue: missingInputs.length === 0,
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at?.toISOString(),
    };
  });
}

export async function getPreparationByOpportunity(
  userId: string,
  opportunityId: string,
): Promise<ApplicationPreparation | null> {
  const result = await query<PreparationRow>(
    `SELECT * FROM application_preparations
      WHERE user_id = $1 AND opportunity_id = $2`,
    [userId, opportunityId],
  );
  return result.rows[0] ? mapPreparation(result.rows[0]) : null;
}

export async function getPreparationByApplication(
  userId: string,
  applicationId: string,
): Promise<ApplicationPreparation | null> {
  const result = await query<PreparationRow>(
    `SELECT p.* FROM application_preparations p
      JOIN applications a ON a.id = p.application_id
      WHERE p.user_id = $1 AND p.application_id = $2`,
    [userId, applicationId],
  );
  return result.rows[0] ? mapPreparation(result.rows[0]) : null;
}

export async function attachPreparationToApplication(
  userId: string,
  opportunityId: string,
  applicationId: string,
): Promise<void> {
  await query(
    `UPDATE application_preparations
        SET application_id = $3
      WHERE user_id = $1 AND opportunity_id = $2`,
    [userId, opportunityId, applicationId],
  );
}

function missingInputsFromAnalysis(
  analysis: ApplicationAnalysis,
  answers: DraftedApplicationAnswer[],
  userInputs: Record<string, string>,
): ApplicationMissingInput[] {
  return missingApplicationInputs({
    fields: analysis.fields,
    questions: answers,
    userInputs,
    emailRecipient: analysis.emailRecipient,
    method: analysis.method,
  });
}

function emailContent(
  analysis: ApplicationAnalysis,
  opportunity: { title: string; companyName: string },
  coverLetter: string,
): string {
  const subject = analysis.emailSubject?.trim() ||
    `Application for ${opportunity.title} - ${opportunity.companyName}`;
  const body = analysis.emailBody?.trim() || coverLetter;
  return `Subject: ${subject}\n\n${body}\n\nBest regards,\n${opportunity.companyName} application`;
}

function answersContent(
  answers: DraftedApplicationAnswer[],
): string {
  if (answers.length === 0) return "No screening questions were detected.";
  return answers.map((answer, index) => {
    const response = answer.answer.trim() || `[Needs your input: ${answer.reason ?? "not found in your profile"}]`;
    return `${String(index + 1).padStart(2, "0")}. ${answer.question}\n${response}`;
  }).join("\n\n");
}

async function savePreparationDocument(input: {
  preparationId: string;
  expectedVersion: number;
  userId: string;
  opportunityId: string;
  applicationId?: string;
  type: "cv" | "cover_letter" | "application_email" | "answer";
  title: string;
  content: string;
  parentDocumentId?: string;
  template: string;
}): Promise<string> {
  return withTransaction(async (client) => {
    const preparation = await client.query<{ version: number; status: string }>(
      `SELECT version, status
         FROM application_preparations
        WHERE id = $1
        FOR UPDATE`,
      [input.preparationId],
    );
    const current = preparation.rows[0];
    if (
      !current ||
      current.version !== input.expectedVersion ||
      current.status !== "RUNNING"
    ) {
      throw new PreparationSupersededError(input.preparationId);
    }

    const existing = await client.query<{ id: string; user_edited: boolean }>(
      `SELECT id, user_edited
         FROM documents
        WHERE preparation_id = $1 AND type = $2
        FOR UPDATE`,
      [input.preparationId, input.type],
    );
    const document = existing.rows[0];
    if (document) {
      if (document.user_edited) return document.id;
      const updated = await client.query(
        `UPDATE documents
            SET title = $2, content = $3, template = $4
          WHERE id = $1
            AND NOT user_edited`,
        [document.id, input.title, input.content, input.template],
      );
      if ((updated.rowCount ?? 0) === 0) {
        throw new PreparationSupersededError(input.preparationId);
      }
      return document.id;
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO documents (
         user_id, opportunity_id, application_id, parent_document_id,
         preparation_id, type, title, content, template
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.userId,
        input.opportunityId,
        input.applicationId ?? null,
        input.parentDocumentId ?? null,
        input.preparationId,
        input.type,
        input.title,
        input.content,
        input.template,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new PreparationSupersededError(input.preparationId);
    return row.id;
  });
}

/**
 * Advances an application while its row is locked by the current transaction.
 *
 * Approval and approval invalidation are state changes across two tables. If
 * the application update happens in a second transaction, a concurrent request
 * can observe (and act on) a half-approved package. Keeping the row lock and
 * both writes in one transaction makes the preparation and application states
 * change together.
 */
async function advanceApplicationInTransaction(
  client: PoolClient,
  userId: string,
  applicationId: string,
  target: ApplicationStatus,
): Promise<ApplicationStatusTransition[]> {
  const selected = await client.query<ApplicationStatusRow>(
    `SELECT status, version, opportunity_id
       FROM applications
      WHERE id = $1 AND user_id = $2
      FOR UPDATE`,
    [applicationId, userId],
  );
  let row = selected.rows[0];
  if (!row) throw new Error("APPLICATION_NOT_FOUND");

  const transitions: ApplicationStatusTransition[] = [];
  const visited = new Set<string>();
  while (row && row.status !== target) {
    if (visited.has(row.status)) return transitions;
    visited.add(row.status);

    const next: ApplicationStatus | undefined =
      (APPLICATION_STATUS_TRANSITIONS[row.status as ApplicationStatus] ?? [])
        .find((candidate) => candidate === target || pathContains(candidate, target));
    if (!next) return transitions;

    const updated: {
      rows: Array<{ status: string; version: number }>;
      rowCount: number | null;
    } = await client.query<{ status: string; version: number }>(
      `UPDATE applications
          SET status = $1,
              applied_at = CASE
                WHEN $1 = 'APPLIED' AND applied_at IS NULL THEN now()
                ELSE applied_at
              END,
              version = version + 1
        WHERE id = $2 AND user_id = $3 AND version = $4
        RETURNING status, version`,
      [next, applicationId, userId, row.version],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw new Error("VERSION_CONFLICT");

    await client.query(
      `INSERT INTO application_events (application_id, from_status, to_status)
       VALUES ($1, $2, $3)`,
      [applicationId, row.status, next],
    );

    transitions.push({
      applicationId,
      userId,
      opportunityId: row.opportunity_id,
      fromStatus: row.status,
      toStatus: next,
      version: updatedRow.version,
    });

    row = {
      status: updatedRow.status,
      version: updatedRow.version,
      opportunity_id: row.opportunity_id,
    };
  }
  return transitions;
}

async function publishApplicationStatusTransitions(
  transitions: ApplicationStatusTransition[],
): Promise<void> {
  await Promise.all(transitions.map(async (transition) => {
    try {
      await enqueueWebhook({
        event: "application.status_changed",
        userId: transition.userId,
        eventId: `${transition.applicationId}:${transition.toStatus}:${transition.version}`,
        data: {
          applicationId: transition.applicationId,
          fromStatus: transition.fromStatus,
          toStatus: transition.toStatus,
          version: transition.version,
          opportunityId: transition.opportunityId,
        },
      });
    } catch (error) {
      logger.warn(
        {
          applicationId: transition.applicationId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to queue application.status_changed webhook",
      );
    }
  }));
}

function pathContains(from: ApplicationStatus, target: ApplicationStatus): boolean {
  const visited = new Set<ApplicationStatus>();
  const queue: ApplicationStatus[] = [...(APPLICATION_STATUS_TRANSITIONS[from] ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(APPLICATION_STATUS_TRANSITIONS[current] ?? []));
  }
  return false;
}

async function persistAnalysis(
  opportunityId: string,
  analysis: ApplicationAnalysis,
  preparationId: string,
  version: number,
): Promise<void> {
  await ensureBlueprint(opportunityId);
  const updated = await query(
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
      WHERE opportunity_id = $1
        AND EXISTS (
          SELECT 1 FROM application_preparations p
           WHERE p.id = $11
             AND p.version = $12
             AND p.status = 'RUNNING'
        )`,
    [
      opportunityId,
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
      preparationId,
      version,
    ],
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw new PreparationSupersededError(preparationId);
  }
}

async function claimPreparation(
  preparationId: string,
  expectedVersion?: number,
  attemptLimit?: number,
): Promise<PreparationClaim | null> {
  return withTransaction(async (client) => {
    const selected = await client.query<PreparationRow>(
      `SELECT * FROM application_preparations
        WHERE id = $1
          AND status = 'QUEUED'
          AND ($2::integer IS NULL OR version = $2::integer)
          AND ($3::integer IS NULL OR attempt_count < $3::integer)
        FOR UPDATE`,
      [preparationId, expectedVersion ?? null, attemptLimit ?? null],
    );
    const current = selected.rows[0];
    if (!current) return null;

    const attemptResult = await client.query<{ attempt: number }>(
      `SELECT COALESCE(MAX(attempt), 0)::int + 1 AS attempt
         FROM application_preparation_runs
        WHERE preparation_id = $1`,
      [preparationId],
    );
    const attempt = attemptResult.rows[0]?.attempt ?? 1;
    const updated = await client.query<PreparationRow>(
      `UPDATE application_preparations
          SET status = 'RUNNING',
              phase = 'researching',
              attempt_count = attempt_count + 1,
              next_attempt_at = NULL,
              error_code = NULL,
              error_detail = NULL
        WHERE id = $1 AND version = $2
        RETURNING *`,
      [preparationId, current.version],
    );
    const preparation = updated.rows[0];
    if (!preparation) return null;
    const run = await client.query<{ id: string }>(
      `INSERT INTO application_preparation_runs (
         preparation_id, attempt, status, stage, payload
       ) VALUES (
         $1, $2, 'RUNNING', 'researching',
         jsonb_build_object('version', $3::integer, 'sourceFingerprint', $4::text)
       )
       RETURNING id`,
      [preparationId, attempt, preparation.version, preparation.source_fingerprint],
    );
    const runId = run.rows[0]?.id;
    if (!runId) throw new Error("PREPARATION_RUN_CREATE_FAILED");
    return {
      preparation,
      runId,
      attempt,
      version: preparation.version,
    };
  });
}

async function completePreparationRun(
  runId: string,
  status: "SUCCEEDED" | "FAILED" | "CANCELLED",
  stage: string,
  error?: string,
): Promise<void> {
  await query(
    `UPDATE application_preparation_runs
        SET status = $2, stage = $3, error_detail = $4, completed_at = now()
      WHERE id = $1 AND status = 'RUNNING'`,
    [runId, status, stage, error ?? null],
  );
}

/**
 * Fences a preparation that is still marked RUNNING when the queue has
 * exhausted its attempts.
 *
 * A worker deadline does not cancel the underlying network work, so a timed
 * out attempt can still be mutating the row. Incrementing the version here
 * makes every later write from that attempt fail its version check. The row
 * is then failed explicitly instead of remaining RUNNING for ever.
 */
async function failRunningPreparation(
  preparationId: string,
  expectedVersion: number,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const selected = await client.query<{ version: number; status: string }>(
      `SELECT version, status
         FROM application_preparations
        WHERE id = $1
        FOR UPDATE`,
      [preparationId],
    );
    const current = selected.rows[0];
    if (!current || current.status !== "RUNNING" || current.version !== expectedVersion) {
      return false;
    }

    await client.query(
      `UPDATE application_preparation_runs
          SET status = 'FAILED',
              stage = 'failed',
              error_code = 'PREPARATION_ATTEMPT_CONFLICT',
              error_detail = 'The preparation attempt was fenced after the queue exhausted its retries.',
              completed_at = now()
        WHERE preparation_id = $1 AND status = 'RUNNING'`,
      [preparationId],
    );
    const updated = await client.query(
      `UPDATE application_preparations
          SET status = 'FAILED',
              phase = 'failed',
              version = version + 1,
              error_code = 'PREPARATION_ATTEMPT_CONFLICT',
              error_detail = 'The preparation attempt was fenced after the queue exhausted its retries.'
        WHERE id = $1 AND version = $2 AND status = 'RUNNING'`,
      [preparationId, expectedVersion],
    );
    return (updated.rowCount ?? 0) > 0;
  });
}

async function updatePreparationPhase(
  preparationId: string,
  version: number,
  phase: string,
): Promise<void> {
  const updated = await query(
    `UPDATE application_preparations
        SET phase = $3, updated_at = now()
      WHERE id = $1 AND version = $2 AND status = 'RUNNING'`,
    [preparationId, version, phase],
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw new PreparationSupersededError(preparationId);
  }
}

/**
 * Runs the complete per-opportunity preparation pipeline.
 *
 * The stages are durable: a failed attempt leaves the record resumable, and a
 * successful attempt saves every generated document before the record is
 * marked ready for review.
 */
export async function runPreparation(
  preparationId: string,
  options: {
    expectedVersion?: number;
    finalAttempt?: boolean;
    attemptLimit?: number;
    attemptNumber?: number;
    retryAttempt?: number;
    retryDelayMs?: number;
  } = {},
): Promise<ApplicationPreparation | null> {
  const claim = await claimPreparation(
    preparationId,
    options.expectedVersion,
    options.attemptLimit,
  );
  if (!claim) {
    const current = await getPreparationById(preparationId);
    const sameVersion = options.expectedVersion === undefined ||
      current?.version === options.expectedVersion;
    if (current?.status === "RUNNING" && sameVersion) {
      // A previous attempt still owns the row. This commonly happens after a
      // worker deadline: BullMQ releases the job slot, but the timed-out
      // network work cannot be cancelled. Treat the race as a failed attempt
      // so BullMQ applies its retry/backoff policy. On the final attempt the
      // running version is fenced and the row becomes explicitly failed.
      if (options.finalAttempt ?? true) {
        await failRunningPreparation(preparationId, current.version);
      }
      throw new PreparationAlreadyRunningError(preparationId);
    }
    return current;
  }

  const preparation = mapPreparation(claim.preparation);
  const { userId, opportunityId } = preparation;
  const version = claim.version;

  try {
    const [profile, opportunity, sources] = await Promise.all([
      getProfile(userId),
      getOpportunity(opportunityId),
      resolveTailoringSources({
        userId,
        sourceCvDocumentId: claim.preparation.source_cv_document_id ?? undefined,
        sourceCoverLetterDocumentId:
          claim.preparation.source_cover_letter_document_id ?? undefined,
      }),
    ]);
    if (!profile) throw new Error("PROFILE_NOT_FOUND");
    if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");
    if (!sources.cv) throw new Error("RESUME_NOT_FOUND");

    await updatePreparationPhase(preparationId, version, "analysing");

    const [analysis, tailored, employerIntelligence] = await Promise.all([
      analyseApplicationPage({
        applyUrl: opportunity.applyUrl,
        applicationMethod: opportunity.applicationMethod,
        profile,
      }),
      generateTailoredDocuments({
        profile,
        opportunity,
        sources,
      }),
      researchEmployer(opportunity),
    ]);

    await updatePreparationPhase(preparationId, version, "writing_answers");
    const answers = await draftApplicationAnswers({
      profile,
      questions: analysis.questions.map((item) => item.question),
      resumeContent: tailored.cv.content,
      coverLetterContent: tailored.coverLetter.content,
      userInputs: preparation.userInputs,
    });

    await updatePreparationPhase(preparationId, version, "saving_documents");
    const [cvDocumentId, coverLetterDocumentId, emailDocumentId, answersDocumentId] = await Promise.all([
      savePreparationDocument({
        preparationId,
        expectedVersion: version,
        userId,
        opportunityId,
        applicationId: preparation.applicationId,
        type: "cv",
        title: `Resume — ${opportunity.title} at ${opportunity.companyName}`,
        content: tailored.cv.content,
        parentDocumentId: sources.cv.id,
        template: DEFAULT_RESUME_TEMPLATE_KEY,
      }),
      savePreparationDocument({
        preparationId,
        expectedVersion: version,
        userId,
        opportunityId,
        applicationId: preparation.applicationId,
        type: "cover_letter",
        title: `Cover letter — ${opportunity.title} at ${opportunity.companyName}`,
        content: tailored.coverLetter.content,
        parentDocumentId: sources.coverLetter?.id,
        template: DEFAULT_COVER_LETTER_TEMPLATE_KEY,
      }),
      savePreparationDocument({
        preparationId,
        expectedVersion: version,
        userId,
        opportunityId,
        applicationId: preparation.applicationId,
        type: "application_email",
        title: `Application email — ${opportunity.title} at ${opportunity.companyName}`,
        content: emailContent(analysis, opportunity, tailored.coverLetter.content),
        template: DEFAULT_COVER_LETTER_TEMPLATE_KEY,
      }),
      savePreparationDocument({
        preparationId,
        expectedVersion: version,
        userId,
        opportunityId,
        applicationId: preparation.applicationId,
        type: "answer",
        title: `Application answers — ${opportunity.title} at ${opportunity.companyName}`,
        content: answersContent(answers),
        template: DEFAULT_COVER_LETTER_TEMPLATE_KEY,
      }),
    ]);

    const documentIds: ApplicationPreparationDocumentIds = {
      cv: cvDocumentId,
      coverLetter: coverLetterDocumentId,
      email: emailDocumentId,
      answers: answersDocumentId,
    };
    const userInputs = preparation.userInputs;
    const missingInputs = missingInputsFromAnalysis(analysis, answers, userInputs);
    const requirements = {
      matched: tailored.cv.matchedRequirements,
      uncovered: [...new Set([
        ...tailored.cv.uncoveredRequirements,
        ...tailored.coverLetter.uncoveredRequirements,
      ])],
      responsibilities: [],
      answers,
    };

    await persistAnalysis(opportunityId, analysis, preparationId, version);
    const status: ApplicationPreparationStatus = missingInputs.length
      ? "NEEDS_INPUT"
      : "AWAITING_REVIEW";
    const finalized = await withTransaction(async (client) => {
      const selected = await client.query<PreparationRow>(
        `SELECT * FROM application_preparations
          WHERE id = $1
          FOR UPDATE`,
        [preparationId],
      );
      const locked = selected.rows[0];
      if (!locked || locked.version !== version || locked.status !== "RUNNING") {
        throw new PreparationSupersededError(preparationId);
      }

      const updated = await client.query<PreparationRow>(
        `UPDATE application_preparations
            SET status = $2,
                phase = $3,
                analysis = $4,
                requirements = $5,
                employer_intelligence = $6,
                document_ids = $7,
                missing_inputs = $8,
                prepared_at = now(),
                error_code = NULL,
                error_detail = NULL,
                next_attempt_at = NULL
          WHERE id = $1
            AND version = $9
            AND status = 'RUNNING'
          RETURNING *`,
        [
          preparationId,
          status,
          missingInputs.length ? "waiting_for_input" : "awaiting_review",
          JSON.stringify(analysis),
          JSON.stringify(requirements),
          JSON.stringify(employerIntelligence),
          JSON.stringify(documentIds),
          JSON.stringify(missingInputs),
          version,
        ],
      );
      const preparedRow = updated.rows[0];
      if (!preparedRow) throw new PreparationSupersededError(preparationId);

      const completedRun = await client.query(
        `UPDATE application_preparation_runs
            SET status = 'SUCCEEDED',
                stage = 'awaiting_review',
                error_code = NULL,
                error_detail = NULL,
                completed_at = now()
          WHERE id = $1 AND status = 'RUNNING'`,
        [claim.runId],
      );
      if ((completedRun.rowCount ?? 0) === 0) {
        throw new PreparationSupersededError(preparationId);
      }

      const transitions = preparation.applicationId
        ? await advanceApplicationInTransaction(
            client,
            userId,
            preparation.applicationId,
            "APPLICATION_PREPARATION",
          )
        : [];

      await client.query(
        `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
         VALUES ('application.preparation.updated', 'application_preparation', $1, $2)`,
        [preparationId, JSON.stringify({ status, opportunityId })],
      );
      return { preparedRow, transitions };
    });

    await publishApplicationStatusTransitions(finalized.transitions);
    try {
      broadcast(
        "application.preparation.updated",
        {
          preparationId,
          opportunityId,
          status,
        },
        userId,
      );
    } catch (error) {
      logger.warn(
        {
          preparationId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Application preparation realtime broadcast failed after commit",
      );
    }
    try {
      await notify(userId, {
        type: "application",
        title: missingInputs.length ? "Your application needs one detail" : "Your application package is ready",
        body: missingInputs.length
          ? "Open the role to answer the question the agent could not find."
          : "Review the tailored resume, cover letter, email, and answers before approving it.",
      });
    } catch (error) {
      // The preparation, run audit, application status, and durable event are
      // already committed. A notification failure must not turn that success
      // into a failed queue attempt.
      logger.warn(
        {
          preparationId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Application preparation notification failed after commit",
      );
    }

    return mapPreparation(finalized.preparedRow);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof PreparationSupersededError) {
      await completePreparationRun(claim.runId, "CANCELLED", "superseded", message);
      logger.info(
        { preparationId, version, message },
        "Application preparation was superseded by a newer version",
      );
      return getPreparationById(preparationId);
    }

    const finalAttempt = options.finalAttempt ?? true;
    const attemptNumber = options.attemptNumber ?? claim.preparation.attempt_count;
    const retryAttempt = options.retryAttempt ?? 1;
    const baseDelay = options.retryDelayMs ?? preparationRetryBaseDelayMs();
    const exponent = Math.min(Math.max(retryAttempt - 1, 0), 6);
    const nextAttemptAt = finalAttempt
      ? null
      : new Date(Date.now() + Math.min(baseDelay * 2 ** exponent, 10 * 60_000));
    await query(
      `UPDATE application_preparations
          SET status = $3,
              phase = $4,
              error_code = $5,
              error_detail = $6,
              next_attempt_at = $7
        WHERE id = $1
          AND version = $2
          AND status = 'RUNNING'`,
      [
        preparationId,
        version,
        finalAttempt ? "FAILED" : "QUEUED",
        "failed",
        message.slice(0, 120),
        message.slice(0, 2_000),
        nextAttemptAt,
      ],
    );
    await completePreparationRun(
      claim.runId,
      "FAILED",
      "failed",
      message,
    );
    logger.error(
      { preparationId, error: message, finalAttempt, attemptNumber },
      "Application preparation failed",
    );
    throw error;
  }
}

export async function getPreparationById(
  preparationId: string,
): Promise<ApplicationPreparation | null> {
  const result = await query<PreparationRow>(
    "SELECT * FROM application_preparations WHERE id = $1",
    [preparationId],
  );
  return result.rows[0] ? mapPreparation(result.rows[0]) : null;
}

export interface RecoveredPreparation {
  preparationId: string;
  version: number;
  userId: string;
  opportunityId: string;
}

/**
 * Recovers preparations whose worker disappeared while the row was RUNNING.
 *
 * The version increment is the fencing token. Any late write from the old
 * attempt carries the previous version and is rejected. The durable attempt
 * count is not reset: a recovered row receives only the attempts that remain
 * in the current source generation's budget.
 */
export async function recoverStalePreparations(
  options: { timeoutMs?: number; limit?: number } = {},
): Promise<RecoveredPreparation[]> {
  const timeoutMs = boundedInteger(
    options.timeoutMs ??
      Number(process.env.APPLICATION_PREPARATION_STALE_MS ?? 20 * 60_000),
    20 * 60_000,
    1,
    24 * 60 * 60_000,
  );
  const limit = boundedInteger(
    options.limit ??
      Number(process.env.APPLICATION_PREPARATION_RECOVERY_BATCH_SIZE ?? 50),
    50,
    1,
    500,
  );
  const attemptLimit = preparationAttemptLimit();

  return withTransaction(async (client) => {
    const stale = await client.query<PreparationRow>(
      `SELECT *
         FROM application_preparations
        WHERE status = 'RUNNING'
          AND updated_at <= now() - ($1 * interval '1 millisecond')
        ORDER BY updated_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [timeoutMs, limit],
    );

    const recovered: RecoveredPreparation[] = [];
    for (const current of stale.rows) {
      const retryDelayMs = preparationRetryDelayMs(current.attempt_count);
      const updated = await client.query<{ version: number; status: string }>(
        `UPDATE application_preparations
            SET status = CASE
                  WHEN attempt_count >= $2 THEN 'FAILED'
                  ELSE 'QUEUED'
                END,
                phase = CASE
                  WHEN attempt_count >= $2 THEN 'failed'
                  ELSE 'queued'
                END,
                version = version + 1,
                next_attempt_at = CASE
                  WHEN attempt_count >= $2 THEN NULL
                  ELSE now() + ($3 * interval '1 millisecond')
                END,
                error_code = 'PREPARATION_RUN_STALE',
                error_detail = CASE
                  WHEN attempt_count >= $2
                    THEN 'The preparation worker stopped responding and the attempt budget is exhausted.'
                    ELSE 'The previous preparation worker stopped responding; the work was queued again.'
                END
          WHERE id = $1 AND status = 'RUNNING'
          RETURNING version, status`,
        [current.id, attemptLimit, retryDelayMs],
      );
      const row = updated.rows[0];
      if (!row) continue;

      await client.query(
        `UPDATE application_preparation_runs
            SET status = 'CANCELLED',
                stage = 'stale_recovered',
                error_code = 'PREPARATION_RUN_STALE',
                error_detail = 'The worker stopped responding before the preparation attempt completed.',
                completed_at = now()
          WHERE preparation_id = $1 AND status = 'RUNNING'`,
        [current.id],
      );
      if (row.status === "QUEUED") {
        recovered.push({
          preparationId: current.id,
          version: row.version,
          userId: current.user_id,
          opportunityId: current.opportunity_id,
        });
      }
    }
    return recovered;
  });
}

export async function savePreparationInputs(
  userId: string,
  applicationId: string,
  inputs: Array<{ key: string; value: string }>,
): Promise<ApplicationPreparation> {
  return withTransaction(async (client) => {
    const selected = await client.query<PreparationRow>(
      `SELECT p.*
         FROM application_preparations p
         JOIN applications a ON a.id = p.application_id
        WHERE p.user_id = $1 AND p.application_id = $2
        FOR UPDATE OF p`,
      [userId, applicationId],
    );
    const current = selected.rows[0];
    if (!current) throw new Error("PREPARATION_NOT_FOUND");

    const existingInputs = Object.fromEntries(
      Object.entries(objectValue(current.user_inputs)).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const allowedKeys = new Set([
      ...arrayValue(current.missing_inputs).flatMap((item) =>
        item &&
        typeof item === "object" &&
        typeof (item as ApplicationMissingInput).key === "string"
          ? [(item as ApplicationMissingInput).key]
          : [],
      ),
      ...Object.keys(existingInputs),
    ]);
    const merged = mergePreparationInputUpdates(
      existingInputs,
      allowedKeys,
      inputs,
    );

    const analysis = objectValue(current.analysis) as unknown as ApplicationAnalysis;
    if (!Array.isArray(analysis.fields)) {
      throw new Error("PREPARATION_ANALYSIS_MISSING");
    }
    const recordedAnswers = arrayValue(objectValue(current.requirements).answers)
      .filter((answer): answer is DraftedApplicationAnswer =>
        Boolean(answer) &&
        typeof answer === "object" &&
        typeof (answer as DraftedApplicationAnswer).question === "string",
      );
    const answers = recordedAnswers.map((answer) => {
      const candidateAnswer = merged[answerInputKey(answer.question)]?.trim();
      return candidateAnswer
        ? {
            ...answer,
            answer: candidateAnswer,
            confidence: 1,
            requiresUserInput: false,
          }
        : answer;
    });
    const missingInputs = missingInputsFromAnalysis(analysis, answers, merged);
    const status: ApplicationPreparationStatus = missingInputs.length
      ? "NEEDS_INPUT"
      : "QUEUED";
    const updated = await client.query<PreparationRow>(
      `UPDATE application_preparations
          SET user_inputs = $2,
              missing_inputs = $3,
              status = $4,
              phase = $5,
              requirements = jsonb_set(requirements, '{answers}', $6::jsonb, true),
              version = version + 1,
              attempt_count = 0,
              next_attempt_at = NULL,
              approved_at = NULL,
              approved_fingerprint = NULL,
              approved_document_ids = '[]'::jsonb,
              prepared_at = NULL,
              error_code = NULL,
              error_detail = NULL
        WHERE id = $1
        RETURNING *`,
      [
        current.id,
        JSON.stringify(merged),
        JSON.stringify(missingInputs),
        status,
        missingInputs.length ? "waiting_for_input" : "queued",
        JSON.stringify(answers),
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("PREPARATION_NOT_FOUND");
    return mapPreparation(row);
  });
}

export interface ApprovedPreparationDocument {
  id: string;
  content: string;
  type: string;
  title: string;
  template: string;
}

export interface ApprovedPreparationSnapshot {
  fingerprint: string;
  documentIds: string[];
  documents: ApprovedPreparationDocument[];
}

/**
 * Loads the exact document set covered by a preparation approval.
 *
 * When a transaction client is supplied, the document rows are held with a
 * shared lock until that transaction commits. A concurrent document edit can
 * therefore finish before the snapshot is taken, or wait until after it, but
 * it cannot change the bytes between the fingerprint check and the snapshot.
 */
export async function loadApprovedPreparationSnapshot(
  preparationId: string,
  client?: PoolClient,
): Promise<ApprovedPreparationSnapshot | null> {
  const sql = `SELECT id, content, type, title, template FROM documents
      WHERE user_id = (SELECT user_id FROM application_preparations WHERE id = $1)
        AND preparation_id = $1
      ORDER BY type ASC, id ASC${client ? " FOR SHARE" : ""}`;
  const documents = client
    ? await client.query<ApprovedPreparationRow>(sql, [preparationId])
    : await query<ApprovedPreparationRow>(sql, [preparationId]);
  if (documents.rows.length === 0) return null;
  const documentIds = documents.rows.map((document) => document.id).sort();
  return {
    fingerprint: approvedDocumentSetFingerprint(documents.rows),
    documentIds,
    documents: documents.rows,
  };
}

export async function approvePreparation(
  userId: string,
  applicationId: string,
): Promise<ApplicationPreparation> {
  const approved = await withTransaction(async (client) => {
    const selected = await client.query<PreparationRow>(
      `SELECT p.*
         FROM application_preparations p
         JOIN applications a ON a.id = p.application_id
        WHERE p.user_id = $1 AND p.application_id = $2
        FOR UPDATE OF p`,
      [userId, applicationId],
    );
    const current = selected.rows[0];
    if (!current) throw new Error("PREPARATION_NOT_FOUND");
    if (current.status !== "AWAITING_REVIEW") {
      throw new Error(`PREPARATION_NOT_READY:${current.status}`);
    }
    if (arrayValue(current.missing_inputs).length > 0) {
      throw new Error("PREPARATION_MISSING_INPUT");
    }

    // The fingerprint and the state change must use the same transaction.
    // Otherwise a document edit can land between the check and the update,
    // leaving a changed package marked as approved.
    const approved = await loadApprovedPreparationSnapshot(current.id, client);
    if (!approved) throw new Error("PREPARATION_DOCUMENTS_MISSING");

    const updated = await client.query<PreparationRow>(
      `UPDATE application_preparations
          SET status = 'READY',
              phase = 'ready_to_apply',
              approved_at = now(),
              approved_fingerprint = $2,
              approved_document_ids = $3
        WHERE id = $1 AND status = 'AWAITING_REVIEW'
        RETURNING *`,
      [current.id, approved.fingerprint, JSON.stringify(approved.documentIds)],
    );
    const row = updated.rows[0];
    if (!row) throw new Error(`PREPARATION_NOT_READY:${current.status}`);

    const transitions = await advanceApplicationInTransaction(
      client,
      userId,
      applicationId,
      "READY_TO_APPLY",
    );
    return { preparation: mapPreparation(row), transitions };
  });

  await publishApplicationStatusTransitions(approved.transitions);
  broadcast(
    "application.preparation.updated",
    {
      preparationId: approved.preparation.id,
      opportunityId: approved.preparation.opportunityId,
      status: "READY",
    },
    userId,
  );
  return approved.preparation;
}

async function invalidateApprovalInTransaction(
  client: PoolClient,
  userId: string,
  current: ApprovalInvalidationPreparation,
): Promise<ApprovalInvalidationResult> {
  const status = current.status === "READY" ? "AWAITING_REVIEW" : current.status;
  const phase = current.status === "READY" ? "awaiting_review" : current.phase;
  await client.query(
    `UPDATE application_preparations
        SET status = $2,
            phase = $3,
            approved_at = NULL,
            approved_fingerprint = NULL,
            approved_document_ids = '[]'::jsonb
      WHERE id = $1`,
    [current.id, status, phase],
  );

  let transitions: ApplicationStatusTransition[] = [];
  if (current.application_id) {
    const application = await client.query<{ status: string }>(
      `SELECT status
         FROM applications
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [current.application_id, userId],
    );
    const applicationStatus = application.rows[0]?.status;
    if (
      current.status === "READY" ||
      applicationStatus === "READY_TO_APPLY"
    ) {
      transitions = await advanceApplicationInTransaction(
        client,
        userId,
        current.application_id,
        "APPLICATION_PREPARATION",
      );
    }
  }

  return {
    preparationId: current.id,
    opportunityId: current.opportunity_id,
    status,
    transitions,
  };
}

/**
 * Updates a document and invalidates its preparation approval atomically.
 *
 * The preparation is locked before the document, matching approval and
 * submission creation. A concurrent submission therefore observes either the
 * old approved package or the edited package, never an edit that has been
 * committed without invalidating its approval.
 */
export async function updateDocumentAndInvalidatePreparation(input: {
  userId: string;
  documentId: string;
  title?: string;
  content?: string;
  template?: string;
  /** The structured document the editor writes. */
  resumeData?: unknown;
}): Promise<EditedPreparationDocument> {
  const edited = await withTransaction(async (client) => {
    const lookup = await client.query<{
      preparation_id: string | null;
    }>(
      `SELECT preparation_id
         FROM documents
        WHERE id = $1 AND user_id = $2`,
      [input.documentId, input.userId],
    );
    const source = lookup.rows[0];
    if (!source) throw new Error("DOCUMENT_NOT_FOUND");

    let preparation: ApprovalInvalidationPreparation | null = null;
    if (source.preparation_id) {
      const selected = await client.query<ApprovalInvalidationPreparation>(
        `SELECT id, application_id, opportunity_id, status, phase
           FROM application_preparations
          WHERE id = $1 AND user_id = $2
          FOR UPDATE`,
        [source.preparation_id, input.userId],
      );
      preparation = selected.rows[0] ?? null;
    }

    const documentResult = await client.query<{
      id: string;
      preparation_id: string | null;
      opportunity_id: string | null;
      type: string;
      title: string;
      content: string;
      template: string;
      created_at: Date;
    }>(
      `SELECT id, preparation_id, opportunity_id, type, title, content,
              template, created_at
         FROM documents
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [input.documentId, input.userId],
    );
    const document = documentResult.rows[0];
    if (!document) throw new Error("DOCUMENT_NOT_FOUND");
    if (
      source.preparation_id &&
      document.preparation_id !== source.preparation_id
    ) {
      throw new Error("DOCUMENT_PREPARATION_CHANGED");
    }

    const changed = input.title !== undefined ||
      input.content !== undefined ||
      input.template !== undefined ||
      input.resumeData !== undefined;
    const updated = await client.query<EditedPreparationDocument>(
      `UPDATE documents
          SET title = COALESCE($3, title),
              content = COALESCE($4, content),
              template = COALESCE($5, template),
              resume_data = COALESCE($7::jsonb, resume_data),
              user_edited = CASE WHEN $6::boolean THEN true ELSE user_edited END
        WHERE id = $1 AND user_id = $2
        RETURNING id, opportunity_id, type, title, content, template, resume_data, created_at`,
      [
        input.documentId,
        input.userId,
        input.title ?? null,
        input.content ?? null,
        input.template ?? null,
        changed,
        input.resumeData === undefined
          ? null
          : JSON.stringify(input.resumeData),
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");

    const invalidation = preparation && changed
      ? await invalidateApprovalInTransaction(client, input.userId, preparation)
      : null;
    return { document: row, invalidation };
  });

  if (edited.invalidation) {
    await publishApplicationStatusTransitions(edited.invalidation.transitions);
    try {
      broadcast(
        "application.preparation.updated",
        {
          preparationId: edited.invalidation.preparationId,
          opportunityId: edited.invalidation.opportunityId,
          status: edited.invalidation.status,
        },
        input.userId,
      );
    } catch (error) {
      logger.warn(
        {
          documentId: input.documentId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Preparation approval invalidation broadcast failed after commit",
      );
    }
  }
  try {
    broadcast("document.updated", { documentId: input.documentId }, input.userId);
  } catch (error) {
    logger.warn(
      {
        documentId: input.documentId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Document update broadcast failed after commit",
    );
  }
  return edited.document;
}

/**
 * Editing a generated document invalidates the approval. The candidate has to
 * approve the exact bytes that will be submitted, not an earlier revision.
 */
export async function invalidatePreparationApproval(
  userId: string,
  documentId: string,
): Promise<void> {
  const invalidated = await withTransaction(async (client) => {
    const selected = await client.query<ApprovalInvalidationPreparation>(
      `SELECT p.id, p.application_id, p.opportunity_id, p.status, p.phase
         FROM application_preparations p
         JOIN documents d ON d.preparation_id = p.id
        WHERE d.id = $1 AND p.user_id = $2
        FOR UPDATE OF p`,
      [documentId, userId],
    );
    const current = selected.rows[0];
    if (!current) return null;
    return invalidateApprovalInTransaction(client, userId, current);
  });

  if (!invalidated) return;
  await publishApplicationStatusTransitions(invalidated.transitions);
  broadcast(
    "application.preparation.updated",
    {
      preparationId: invalidated.preparationId,
      opportunityId: invalidated.opportunityId,
      status: invalidated.status,
    },
    userId,
  );
}

export async function verifyPreparationApproval(
  preparation: ApplicationPreparation,
): Promise<boolean> {
  if (!preparation.approvedAt || preparation.status !== "READY") return false;
  const approved = await loadApprovedPreparationSnapshot(preparation.id);
  return Boolean(
    approved &&
    approved.fingerprint === preparation.approvedFingerprint,
  );
}

export type { EmployerIntelligence };
