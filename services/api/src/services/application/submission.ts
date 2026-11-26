import { randomUUID } from "node:crypto";
import type {
  ApplicationStatus,
  ApplicationSubmissionField,
  ApplicationSubmissionRun,
  ApplicationSubmissionStatus,
} from "@angisoft/mboqara-contracts";
import { APPLICATION_STATUS_TRANSITIONS } from "@angisoft/mboqara-contracts";
import { query, withTransaction } from "../../db/pool.js";
import { assertPublicUrl } from "../../lib/net-guard.js";
import { logger } from "../../logger.js";
import { broadcast } from "../../realtime/hub.js";
import {
  getApplicationBlueprint,
  updateApplicationStatus,
} from "../applications.js";
import { renderPdf, contentToExportSections } from "../documents/export.js";
import { submissionMethodForBlueprint } from "./submission-method.js";
import { selectSubmissionSnapshotDocument } from "./submission-snapshot.js";
import {
  ACTIVE_SUBMISSION_CONFLICT_SQL,
  ACTIVE_SUBMISSION_STATUS_SQL,
  isActiveSubmissionStatus,
} from "./submission-run-policy.js";
import {
  getPreparationByApplication,
  loadApprovedPreparationSnapshot,
  verifyPreparationApproval,
  type ApprovedPreparationDocument,
} from "./preparation.js";
import type { ApplicationAnalysis } from "./analyzer.js";
import { hasActiveBrowserAgent } from "./browser.js";
import {
  isAllowedSubmissionHost,
  isConfirmedSubmission,
  isExpectedSubmissionStep,
} from "./policy.js";

interface SubmissionRow {
  id: string;
  user_id: string;
  application_id: string;
  preparation_id: string;
  status: string;
  current_step: string;
  consent_at: Date;
  target_url: string;
  allowed_hosts: string[];
  fields: unknown;
  documents: unknown;
  document_snapshot: unknown;
  approved_fingerprint: string | null;
  answers: unknown;
  result: unknown;
  error_code: string | null;
  error_detail: string | null;
  lease_expires_at: Date | null;
  /** Optional for rows created before migration 042. */
  method?: string | null;
  lease_expired?: boolean;
  created_at: Date;
  updated_at: Date;
}

interface SubmissionPreparationRow {
  id: string;
  status: string;
  version: number;
  analysis: unknown;
  requirements: unknown;
  missing_inputs: unknown;
  user_inputs: unknown;
  approved_at: Date | null;
  approved_fingerprint: string | null;
}

export type SubmissionField = ApplicationSubmissionField;

export interface SubmissionDocument {
  documentId: string;
  type: string;
  title: string;
  filename: string;
  fieldKeys: string[];
  downloadPath: string;
}

export interface BrowserCommand {
  type: "inspect_form" | "fill_fields" | "upload_documents" | "prepare_submission" | "submit";
  /** Changes whenever the run resumes, so retries stay idempotent. */
  commandId: string;
  runId: string;
  targetUrl: string;
  allowedHosts: string[];
  fields?: SubmissionField[];
  documents?: SubmissionDocument[];
}

export interface BrowserRunReport {
  idempotencyKey: string;
  step: string;
  status: "ok" | "failed" | "needs_input" | "blocked";
  url?: string;
  fields?: Record<string, unknown> | Array<Record<string, unknown>>;
  result?: Record<string, unknown>;
  error?: string;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapSubmissionFields(value: unknown): ApplicationSubmissionField[] {
  return arrayValue(value).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const field = item as Record<string, unknown>;
    const key = typeof field.key === "string" ? field.key.trim() : "";
    if (!key) return [];

    const options = Array.isArray(field.options)
      ? field.options.filter((option): option is string => typeof option === "string")
      : undefined;
    return [{
      key,
      label: typeof field.label === "string" && field.label.trim()
        ? field.label.trim()
        : key,
      type: typeof field.type === "string" && field.type.trim()
        ? field.type.trim()
        : "text",
      required: field.required === true,
      value: typeof field.value === "string" ? field.value : undefined,
      options: options?.length ? options : undefined,
    }];
  });
}

function mapRun(row: SubmissionRow): ApplicationSubmissionRun {
  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id,
    preparationId: row.preparation_id,
    status: row.status as ApplicationSubmissionStatus,
    method: submissionMethodForBlueprint(row.method),
    currentStep: row.current_step,
    targetUrl: row.target_url,
    allowedHosts: row.allowed_hosts,
    fields: mapSubmissionFields(row.fields),
    result: (row.result && typeof row.result === "object" && !Array.isArray(row.result))
      ? (row.result as Record<string, unknown>)
      : {},
    errorCode: row.error_code ?? undefined,
    errorDetail: row.error_detail ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function commandIdFor(row: SubmissionRow): string {
  return `${row.id}:${row.current_step}:${row.updated_at.toISOString()}`;
}

function browserCommandForRow(row: SubmissionRow): BrowserCommand | null {
  const base = {
    commandId: commandIdFor(row),
    runId: row.id,
    targetUrl: row.target_url,
    allowedHosts: row.allowed_hosts,
  };
  switch (row.current_step) {
    case "INSPECT_FORM":
      return { type: "inspect_form", ...base };
    case "FILL_FIELDS":
      return {
        type: "fill_fields",
        ...base,
        fields: mapSubmissionFields(row.fields),
      };
    case "UPLOAD_DOCUMENTS":
      return {
        type: "upload_documents",
        ...base,
        documents: arrayValue(row.documents) as SubmissionDocument[],
      };
    case "PREPARE_SUBMISSION":
      return { type: "prepare_submission", ...base };
    case "SUBMIT":
      return { type: "submit", ...base };
    default:
      return null;
  }
}

function analysisOf(preparation: { analysis: Record<string, unknown> }): ApplicationAnalysis {
  return preparation.analysis as unknown as ApplicationAnalysis;
}

function emailBodyFromDocument(content: string, subject: string): string {
  const withoutSubject = content.replace(/^Subject:\s*.*$/im, "").trim();
  return withoutSubject || content;
}

function buildSubmissionFields(
  analysis: ApplicationAnalysis,
  userInputs: Record<string, string>,
  snapshot: ApprovedPreparationDocument[],
): SubmissionField[] {
  const fields: SubmissionField[] = [];
  if (analysis.method === "email") {
    let body = analysis.emailBody ?? "";
    let subject = analysis.emailSubject ?? "";
    const emailDocument = snapshot.find((document) =>
      document.type === "application_email",
    );
    if (emailDocument) {
      body = emailBodyFromDocument(emailDocument.content, subject);
      const subjectMatch = emailDocument.content.match(/^Subject:\s*(.*)$/im);
      if (subjectMatch?.[1]) subject = subjectMatch[1].trim();
    }

    const recipient = userInputs.application_recipient || analysis.emailRecipient;
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new Error("PREPARATION_FIELD_MISSING:application_recipient");
    }
    fields.push(
      {
        key: "application_recipient",
        label: "Recipient",
        type: "email",
        required: true,
        value: recipient,
      },
      {
        key: "application_subject",
        label: "Subject",
        type: "text",
        required: true,
        value: subject,
      },
      {
        key: "application_body",
        label: "Message",
        type: "textarea",
        required: true,
        value: body,
      },
    );
    return fields;
  }

  for (const field of analysis.fields) {
    if (field.type === "file" || field.humanOnly) continue;
    const value = userInputs[field.key] || field.suggestedValue;
    if (field.required && !value?.trim()) {
      throw new Error(`PREPARATION_FIELD_MISSING:${field.key}`);
    }
    fields.push({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      value,
      options: field.options,
    });
  }
  return fields;
}

function buildSubmissionDocuments(
  analysis: ApplicationAnalysis,
  snapshot: ApprovedPreparationDocument[],
  runId: string,
): SubmissionDocument[] {
  return snapshot
    .filter((document) =>
      document.type === "cv" || document.type === "cover_letter",
    )
    .map((document) => {
      const fileFields = analysis.fields
        .filter((field) => field.type === "file")
        .filter((field) => {
          const haystack = `${field.key} ${field.label}`.toLowerCase();
          if (document.type === "cv") return /resume|cv|curriculum/.test(haystack);
          if (document.type === "cover_letter") return /cover/.test(haystack);
          return false;
        })
        .map((field) => field.key);
      return {
        documentId: document.id,
        type: document.type,
        title: document.title,
        filename: safeFilename(
          `${document.type === "cv" ? "Resume" : document.type === "cover_letter" ? "Cover-Letter" : document.title}.pdf`,
        ),
        fieldKeys: fileFields,
        downloadPath: `/agent/browser/runs/${runId}/documents/${document.id}`,
      };
    })
    .filter((document) =>
      analysis.method === "email" || document.fieldKeys.length > 0,
    );
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function latestActiveRun(
  userId: string,
  applicationId: string,
): Promise<SubmissionRow | null> {
  const result = await query<SubmissionRow>(
    `SELECT * FROM application_submission_runs
      WHERE user_id = $1 AND application_id = $2
        AND status IN (${ACTIVE_SUBMISSION_STATUS_SQL})
      ORDER BY created_at DESC LIMIT 1`,
    [userId, applicationId],
  );
  return result.rows[0] ?? null;
}

/**
 * Starts an application submission after the candidate approved the exact
 * package. The run is not sent to an employer yet; it waits for the paired
 * browser agent to claim it.
 */
export async function createSubmissionRun(
  userId: string,
  applicationId: string,
  options: { guidedSession?: boolean } = {},
): Promise<ApplicationSubmissionRun> {
  const active = await latestActiveRun(userId, applicationId);
  if (active) return mapRun(active);

  const preparation = await getPreparationByApplication(userId, applicationId);
  if (!preparation) throw new Error("PREPARATION_NOT_FOUND");
  if (preparation.status !== "READY") {
    throw new Error(`PREPARATION_NOT_APPROVED:${preparation.status}`);
  }
  if (preparation.missingInputs.length > 0) {
    throw new Error("PREPARATION_MISSING_INPUT");
  }
  if (!(await verifyPreparationApproval(preparation))) {
    throw new Error("PREPARATION_APPROVAL_STALE");
  }
  // The extension agent is required only for its own command channel. The
  // guided browser workspace has already authenticated and owns a live
  // guidance session, so it does not need a second agent to open the run.
  if (!options.guidedSession && !(await hasActiveBrowserAgent(userId))) {
    throw new Error("BROWSER_AGENT_REQUIRED");
  }

  // The approved blueprint, not a constant, decides whether this is an email
  // compose or a browser form. Only the run's metadata changes; the browser
  // command protocol below is identical for both methods.
  const blueprint = await getApplicationBlueprint(userId, applicationId);
  const submissionMethod = submissionMethodForBlueprint(blueprint.method);

  const initialAnalysis = analysisOf(preparation);
  let targetUrl = initialAnalysis.analysisUrl;
  let allowedHosts: string[] = [];
  if (initialAnalysis.method === "email") {
    targetUrl = "https://mail.google.com/mail/u/0/#compose";
    allowedHosts = ["mail.google.com"];
  } else {
    const publicUrl = await assertPublicUrl(targetUrl);
    targetUrl = publicUrl.toString();
    const host = hostOf(targetUrl);
    allowedHosts = host ? [host] : [];
  }

  const runId = randomUUID();
  const outcome = await withTransaction(async (client) => {
    // Locking the preparation serializes competing submission requests for the
    // same approved package. The partial unique index remains the final guard
    // in case an application is ever associated with more than one preparation.
    const selected = await client.query<SubmissionPreparationRow>(
      `SELECT p.id, p.status, p.version, p.analysis, p.requirements,
              p.missing_inputs, p.user_inputs, p.approved_at,
              p.approved_fingerprint
         FROM application_preparations p
         JOIN applications a ON a.id = p.application_id
        WHERE p.user_id = $1 AND p.application_id = $2
        FOR UPDATE OF p`,
      [userId, applicationId],
    );
    const current = selected.rows[0];
    if (!current) throw new Error("PREPARATION_NOT_FOUND");

    const concurrent = await client.query<SubmissionRow>(
      `SELECT * FROM application_submission_runs
        WHERE user_id = $1 AND application_id = $2
          AND status IN (${ACTIVE_SUBMISSION_STATUS_SQL})
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [userId, applicationId],
    );
    if (concurrent.rows[0]) {
      return { row: concurrent.rows[0], created: false };
    }

    if (current.version !== preparation.version) {
      throw new Error("PREPARATION_APPROVAL_STALE");
    }
    if (current.status !== "READY") {
      throw new Error(`PREPARATION_NOT_APPROVED:${current.status}`);
    }
    if (arrayValue(current.missing_inputs).length > 0) {
      throw new Error("PREPARATION_MISSING_INPUT");
    }
    if (!current.approved_at || !current.approved_fingerprint) {
      throw new Error("PREPARATION_APPROVAL_STALE");
    }

    // This transaction holds shared locks on the approved document rows. The
    // fingerprint check and the snapshot therefore describe one immutable set
    // of bytes, even if a document edit races the submission request.
    const snapshot = await loadApprovedPreparationSnapshot(current.id, client);
    if (!snapshot || snapshot.fingerprint !== current.approved_fingerprint) {
      throw new Error("PREPARATION_APPROVAL_STALE");
    }

    const analysis = analysisOf({
      analysis: current.analysis as Record<string, unknown>,
    });
    const fields = buildSubmissionFields(
      analysis,
      stringRecord(current.user_inputs),
      snapshot.documents,
    );
    const documents = buildSubmissionDocuments(analysis, snapshot.documents, runId);
    const documentSnapshot = snapshot.documents.map((document) => ({
      documentId: document.id,
      type: document.type,
      title: document.title,
      content: document.content,
      template: document.template,
    }));

    const inserted = await client.query<SubmissionRow>(
      `INSERT INTO application_submission_runs (
         id, user_id, application_id, preparation_id, status, current_step,
         consent_at, target_url, allowed_hosts, fields, documents,
         document_snapshot, approved_fingerprint, answers, method
       ) VALUES (
         $1, $2, $3, $4, 'REQUESTED', 'INSPECT_FORM', now(), $5, $6,
         $7, $8, $9, $10, $11, $12
       )
       ${ACTIVE_SUBMISSION_CONFLICT_SQL}
       RETURNING *`,
      [
        runId,
        userId,
        applicationId,
        current.id,
        targetUrl,
        allowedHosts,
        JSON.stringify(fields),
        JSON.stringify(documents),
        JSON.stringify(documentSnapshot),
        snapshot.fingerprint,
        JSON.stringify(current.requirements),
        submissionMethod,
      ],
    );
    const row = inserted.rows[0];
    if (row) {
      await client.query(
        `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
         VALUES ('application.submission.requested', 'application', $1, $2)`,
        [applicationId, JSON.stringify({ runId: row.id })],
      );
      return { row, created: true };
    }

    // Another transaction won the partial unique index. Read its committed
    // row and return the same active run to both callers.
    const winner = await client.query<SubmissionRow>(
      `SELECT * FROM application_submission_runs
        WHERE user_id = $1 AND application_id = $2
          AND status IN (${ACTIVE_SUBMISSION_STATUS_SQL})
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, applicationId],
    );
    const winnerRow = winner.rows[0];
    if (!winnerRow) throw new Error("SUBMISSION_CREATE_FAILED");
    return { row: winnerRow, created: false };
  });

  if (outcome.created) {
    try {
      broadcast(
        "application.submission.updated",
        { applicationId, runId: outcome.row.id, status: "REQUESTED" },
        userId,
      );
    } catch (error) {
      logger.warn(
        {
          runId: outcome.row.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Application submission realtime broadcast failed after commit",
      );
    }
  }
  return mapRun(outcome.row);
}

export async function getLatestSubmission(
  userId: string,
  applicationId: string,
): Promise<ApplicationSubmissionRun | null> {
  const result = await query<SubmissionRow>(
    `SELECT * FROM application_submission_runs
      WHERE user_id = $1 AND application_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [userId, applicationId],
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export async function getSubmissionRun(
  runId: string,
): Promise<SubmissionRow | null> {
  const result = await query<SubmissionRow>(
    "SELECT * FROM application_submission_runs WHERE id = $1",
    [runId],
  );
  return result.rows[0] ?? null;
}

/**
 * Claims the oldest requested run for a paired browser agent.
 */
export async function claimNextSubmissionRun(
  userId: string,
): Promise<{ run: SubmissionRow; command: BrowserCommand } | null> {
  const claimed = await query<SubmissionRow>(
    `UPDATE application_submission_runs
        SET status = 'CLAIMED',
            lease_expires_at = now() + interval '90 seconds'
      WHERE id = (
        SELECT id FROM application_submission_runs
         WHERE user_id = $1 AND status = 'REQUESTED'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    [userId],
  );
  const row = claimed.rows[0];
  if (!row) return null;
  const command = browserCommandForRow(row);
  if (!command) throw new Error(`SUBMISSION_STEP_UNKNOWN:${row.current_step}`);
  return { run: row, command };
}

export async function nextBrowserCommand(
  userId: string,
  runId: string,
): Promise<BrowserCommand | null> {
  const result = await query<SubmissionRow>(
    "SELECT * FROM application_submission_runs WHERE id = $1 AND user_id = $2",
    [runId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if ([
    "SUCCEEDED",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
    "WAITING_FOR_INPUT",
    "WAITING_FOR_HUMAN",
  ].includes(row.status)) return null;
  if (
    ["CLAIMED", "RUNNING"].includes(row.status) &&
    row.lease_expires_at &&
    row.lease_expires_at.getTime() <= Date.now()
  ) {
    return null;
  }

  return browserCommandForRow(row);
}

export async function heartbeatSubmissionRun(
  userId: string,
  runId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE application_submission_runs
        SET lease_expires_at = now() + interval '90 seconds',
            status = CASE WHEN status = 'CLAIMED' THEN 'RUNNING' ELSE status END
      WHERE id = $1 AND user_id = $2
        AND status IN ('CLAIMED', 'RUNNING')
        AND (lease_expires_at IS NULL OR lease_expires_at > now())`,
    [runId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function advanceApplicationToApplied(
  userId: string,
  applicationId: string,
): Promise<void> {
  let current = await query<{ status: string; version: number }>(
    "SELECT status, version FROM applications WHERE id = $1 AND user_id = $2",
    [applicationId, userId],
  );
  let row = current.rows[0];
  if (!row || row.status === "APPLIED") return;

  const visited = new Set<string>();
  while (row && row.status !== "APPLIED") {
    if (visited.has(row.status)) return;
    visited.add(row.status);
    const next = (APPLICATION_STATUS_TRANSITIONS[row.status as ApplicationStatus] ?? [])
      .find((candidate) => candidate === "APPLIED" || canReach(candidate, "APPLIED"));
    if (!next) return;
    const updated = await updateApplicationStatus(
      userId,
      applicationId,
      next,
      row.version,
    );
    row = { status: updated.status, version: updated.version };
  }
}

function canReach(
  from: ApplicationStatus,
  target: ApplicationStatus,
): boolean {
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

export async function reportSubmissionRun(
  userId: string,
  runId: string,
  report: BrowserRunReport,
): Promise<{ status: ApplicationSubmissionStatus; nextCommand: BrowserCommand | null }> {
  const result = await withTransaction(async (client) => {
    const currentResult = await client.query<SubmissionRow>(
      `SELECT *,
              (lease_expires_at IS NOT NULL AND lease_expires_at <= now()) AS lease_expired
         FROM application_submission_runs
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [runId, userId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("SUBMISSION_NOT_FOUND");

    if (["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(current.status)) {
      return {
        row: current,
        status: current.status as ApplicationSubmissionStatus,
        changed: false,
      };
    }

    if (
      current.lease_expired &&
      ["REQUESTED", "CLAIMED", "RUNNING"].includes(current.status)
    ) {
      const expired = await client.query<SubmissionRow>(
        `UPDATE application_submission_runs
            SET status = 'EXPIRED',
                error_code = 'BROWSER_AGENT_LEASE_EXPIRED',
                error_detail = 'The browser agent lease expired before this report was received.'
          WHERE id = $1
          RETURNING *`,
        [runId],
      );
      return {
        row: expired.rows[0] ?? current,
        status: "EXPIRED" as ApplicationSubmissionStatus,
        changed: true,
      };
    }

    if (!isExpectedSubmissionStep(current.current_step, report.step)) {
      throw new Error(
        `SUBMISSION_STEP_MISMATCH:${current.current_step}:${report.step}`,
      );
    }

    const inserted = await client.query(
      `INSERT INTO application_submission_reports (
         run_id, idempotency_key, step, status, url, fields, result, error
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (run_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        runId,
        report.idempotencyKey,
        report.step,
        report.status,
        report.url ?? null,
        JSON.stringify(report.fields ?? {}),
        JSON.stringify(report.result ?? {}),
        report.error ?? null,
      ],
    );
    if ((inserted.rowCount ?? 0) === 0) {
      return {
        row: current,
        status: current.status as ApplicationSubmissionStatus,
        changed: false,
      };
    }

    let status = current.status as ApplicationSubmissionStatus;
    let nextStep = current.current_step;
    let errorCode: string | null = null;
    let errorDetail: string | null = null;

    if (
      report.url &&
      !isAllowedSubmissionHost(report.url, current.allowed_hosts)
    ) {
      status = "WAITING_FOR_HUMAN";
      errorCode = "UNEXPECTED_DESTINATION";
      errorDetail = `The browser moved to an unapproved host: ${hostOf(report.url) ?? "unknown"}.`;
    } else if (report.status === "blocked" || report.status === "needs_input") {
      status = report.status === "blocked" ? "WAITING_FOR_HUMAN" : "WAITING_FOR_INPUT";
      errorCode = report.status === "blocked" ? "HUMAN_ACTION_REQUIRED" : "MISSING_INPUT";
      errorDetail = report.error ?? "The browser agent needs the candidate's attention.";
    } else if (report.status === "failed") {
      status = "FAILED";
      errorCode = "BROWSER_AGENT_FAILED";
      errorDetail = report.error ?? "The browser agent could not complete the step.";
    } else {
      switch (report.step) {
        case "INSPECT_FORM":
          nextStep = "FILL_FIELDS";
          break;
        case "FILL_FIELDS":
          nextStep = "UPLOAD_DOCUMENTS";
          break;
        case "UPLOAD_DOCUMENTS":
          nextStep = "PREPARE_SUBMISSION";
          break;
        case "PREPARE_SUBMISSION":
          nextStep = "SUBMIT";
          break;
        case "SUBMIT":
          if (!isConfirmedSubmission(report.result)) {
            status = "WAITING_FOR_INPUT";
            errorCode = "SUBMISSION_NOT_CONFIRMED";
            errorDetail = report.error ?? "The employer did not show a submission confirmation. Verify the form before retrying.";
          } else {
            status = "SUCCEEDED";
          }
          break;
        default:
          break;
      }
    }

    const updated = await client.query<SubmissionRow>(
      `UPDATE application_submission_runs
          SET status = $2,
              current_step = $3,
              error_code = $4,
              error_detail = $5,
              result = result || $6,
              lease_expires_at = now() + interval '90 seconds'
        WHERE id = $1
        RETURNING *`,
      [
        runId,
        status,
        nextStep,
        errorCode,
        errorDetail,
        JSON.stringify({
          lastStep: report.step,
          lastUrl: report.url,
          lastResult: report.result ?? {},
        }),
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("SUBMISSION_NOT_FOUND");
    return { row, status, changed: true };
  });

  if (result.changed && result.status === "SUCCEEDED") {
    await advanceApplicationToApplied(userId, result.row.application_id);
    await query(
      `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
       VALUES ('application.submitted', 'application', $1, $2)`,
      [result.row.application_id, JSON.stringify({ runId, url: report.url ?? null })],
    );
  }
  if (result.changed) {
    broadcast(
      "application.submission.updated",
      { applicationId: result.row.application_id, runId, status: result.status },
      userId,
    );
  }

  const nextCommand = result.changed &&
    !["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"].includes(result.status)
    ? await nextBrowserCommand(userId, runId)
    : null;
  return { status: result.status, nextCommand };
}

/**
 * The guided browser workspace has no extension agent to report a run, so the
 * candidate's explicit confirmation completes the run here. The session must
 * still be live, and the run must belong to the same user and application.
 */
export async function completeGuidedSubmission(
  userId: string,
  applicationId: string,
  guidanceSessionId: string,
  url?: string,
  runId?: string,
): Promise<ApplicationSubmissionRun> {
  const row = await withTransaction(async (client) => {
    const session = await client.query<{ id: string }>(
      `SELECT id FROM application_guidance_sessions
        WHERE id = $1 AND user_id = $2 AND application_id = $3
          AND status = ANY($4::text[]) AND ended_at IS NULL
        FOR UPDATE`,
      [guidanceSessionId, userId, applicationId, ["ACTIVE", "WAITING_FOR_HUMAN"]],
    );
    if (!session.rows[0]) throw new Error("GUIDANCE_SESSION_NOT_FOUND");

    const updated = await client.query<SubmissionRow>(
      `UPDATE application_submission_runs
          SET status = 'SUCCEEDED',
              current_step = 'SUBMIT',
              result = result || $1
        WHERE id = COALESCE(
          $4::uuid,
          (SELECT id FROM application_submission_runs
            WHERE user_id = $2 AND application_id = $3
              AND status NOT IN ('SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED')
            ORDER BY created_at DESC LIMIT 1)
        )
          AND user_id = $2
          AND application_id = $3
          AND status NOT IN ('SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED')
        RETURNING *`,
      [
        JSON.stringify({
          confirmedBy: "guided_browser",
          url: url ?? null,
          completedAt: new Date().toISOString(),
        }),
        userId,
        applicationId,
        runId ?? null,
      ],
    );
    const run = updated.rows[0];
    if (!run) throw new Error("SUBMISSION_NOT_FOUND");
    await client.query(
      `UPDATE application_guidance_sessions
          SET submission_run_id = $2
        WHERE id = $1`,
      [guidanceSessionId, run.id],
    );
    return run;
  });

  await advanceApplicationToApplied(userId, applicationId);
  await query(
    `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
     VALUES ('application.submitted', 'application', $1, $2)`,
    [applicationId, JSON.stringify({ runId: row.id, url: url ?? null, guided: true })],
  );
  broadcast(
    "application.submission.updated",
    { applicationId, runId: row.id, status: "SUCCEEDED" },
    userId,
  );
  return mapRun(row);
}

export async function resumeSubmissionRun(
  userId: string,
  applicationId: string,
  input: {
    values?: Record<string, string>;
  } = {},
): Promise<ApplicationSubmissionRun> {
  const outcome = await withTransaction(async (client) => {
    // Submission creation and resume use the same lock order: preparation,
    // active run, then the row being resumed. This serializes the two paths
    // without relying on an UPDATE conflict clause, which PostgreSQL does not
    // support.
    const preparationLock = await client.query<{ id: string }>(
      `SELECT p.id
         FROM application_preparations p
         JOIN applications a ON a.id = p.application_id
        WHERE p.user_id = $1 AND p.application_id = $2
        LIMIT 1
        FOR UPDATE OF p`,
      [userId, applicationId],
    );
    if (!preparationLock.rows[0]) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }

    // Return an existing active run before considering a terminal row. This
    // covers both a pre-existing winner and two callers racing to resume the
    // same terminal run.
    const activeResult = await client.query<SubmissionRow>(
      `SELECT * FROM application_submission_runs
        WHERE user_id = $1 AND application_id = $2
          AND status IN (${ACTIVE_SUBMISSION_STATUS_SQL})
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [userId, applicationId],
    );
    const active = activeResult.rows[0];
    if (active) return { row: active, resumed: false };

    const currentResult = await client.query<SubmissionRow>(
      `SELECT * FROM application_submission_runs
        WHERE user_id = $1 AND application_id = $2
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`,
      [userId, applicationId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("SUBMISSION_NOT_FOUND");
    if (isActiveSubmissionStatus(current.status)) {
      return { row: current, resumed: false };
    }
    if (!["WAITING_FOR_INPUT", "WAITING_FOR_HUMAN", "FAILED", "EXPIRED"].includes(current.status)) {
      throw new Error(`SUBMISSION_NOT_RESUMABLE:${current.status}`);
    }

    const fields = mapSubmissionFields(current.fields);
    if (input.values) {
      for (const field of fields) {
        const value = input.values[field.key];
        if (value !== undefined) field.value = value;
      }
    }

    const updated = await client.query<SubmissionRow>(
      `UPDATE application_submission_runs
          SET status = 'REQUESTED',
              fields = $2,
              error_code = NULL,
              error_detail = NULL,
              lease_expires_at = NULL
        WHERE id = $1
        RETURNING *`,
      [current.id, JSON.stringify(fields)],
    );
    const row = updated.rows[0];
    if (row) return { row, resumed: true };

    // A concurrent request already owns the application's active slot. The
    // browser must continue with that run rather than receiving a unique
    // violation or a second executable run.
    const winner = await client.query<SubmissionRow>(
      `SELECT * FROM application_submission_runs
        WHERE user_id = $1 AND application_id = $2
          AND status IN (${ACTIVE_SUBMISSION_STATUS_SQL})
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, applicationId],
    );
    const winnerRow = winner.rows[0];
    if (!winnerRow) throw new Error("SUBMISSION_CREATE_FAILED");
    return { row: winnerRow, resumed: false };
  });

  if (outcome.resumed) {
    try {
      broadcast(
        "application.submission.updated",
        {
          applicationId,
          runId: outcome.row.id,
          status: outcome.row.status,
        },
        userId,
      );
    } catch (error) {
      logger.warn(
        {
          runId: outcome.row.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Application submission resume broadcast failed after commit",
      );
    }
  }
  return mapRun(outcome.row);
}

/**
 * Releases runs whose browser companion stopped heartbeating. Human waits
 * are deliberately not expired: a candidate may need several minutes to
 * accept a legal statement or complete a verification step.
 */
export async function expireStaleSubmissionRuns(): Promise<number> {
  const requestedTtlValue = Number(process.env.SUBMISSION_REQUESTED_TTL_HOURS ?? 24);
  const requestedTtlHours = Math.min(
    Math.max(Number.isFinite(requestedTtlValue) ? requestedTtlValue : 24, 1),
    24 * 30,
  );
  const result = await query(
    `UPDATE application_submission_runs
        SET status = 'EXPIRED',
            error_code = CASE
              WHEN status = 'REQUESTED' THEN 'BROWSER_AGENT_REQUEST_TIMEOUT'
              ELSE 'BROWSER_AGENT_LEASE_EXPIRED'
            END,
            error_detail = CASE
              WHEN status = 'REQUESTED'
                THEN 'No browser agent claimed the application before the request expired.'
                ELSE 'The browser agent stopped responding before the application was confirmed.'
            END
      WHERE (
        status IN ('CLAIMED', 'RUNNING')
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= now()
      ) OR (
        status = 'REQUESTED'
        AND COALESCE(
          lease_expires_at,
          updated_at + ($1 * interval '1 hour')
        ) <= now()
      )`,
    [requestedTtlHours],
  );
  return result.rowCount ?? 0;
}

export async function cancelSubmissionRun(
  userId: string,
  applicationId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE application_submission_runs
        SET status = 'CANCELLED'
      WHERE user_id = $1 AND application_id = $2
        AND status NOT IN ('SUCCEEDED', 'CANCELLED')`,
    [userId, applicationId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Renders one approved document for the browser agent to upload. The run must
 * already list the document; the device token therefore cannot be used to
 * browse a candidate's document library.
 */
export async function renderSubmissionDocument(input: {
  userId: string;
  runId: string;
  documentId: string;
}): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  const run = await query<SubmissionRow>(
    "SELECT * FROM application_submission_runs WHERE id = $1 AND user_id = $2",
    [input.runId, input.userId],
  );
  const row = run.rows[0];
  if (!row) return null;
  const documents = arrayValue(row.documents) as SubmissionDocument[];
  const listed = documents.find((document) => document.documentId === input.documentId);
  if (!listed) return null;

  // Submission documents are rendered from the immutable snapshot captured
  // when the run was created. Reading the live document row here would let a
  // later edit change the bytes after the candidate approved the package.
  const source = selectSubmissionSnapshotDocument(
    row.document_snapshot,
    row.approved_fingerprint,
    input.documentId,
  );
  if (!source) return null;

  const buffer = await renderPdf(
    {
      title: source.title,
      sections: contentToExportSections(source.content),
    },
    source.template,
  );
  return {
    buffer,
    filename: listed.filename || safeFilename(`${source.title}.pdf`),
    mimeType: "application/pdf",
  };
}
