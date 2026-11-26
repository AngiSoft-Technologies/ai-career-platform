import { randomUUID } from "node:crypto";
import type {
  ApplicationGuidanceSession,
  ApplicationPreparation,
  BrowserWorkspace,
  GuidanceDetectedField,
  GuidanceHint,
  GuidanceMode,
  SitePlaybook,
  SitePlaybookStep,
} from "@angisoft/mboqara-contracts";
import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { redactUrl } from "../lib/redact.js";
import {
  getPreparationByApplication,
  verifyPreparationApproval,
} from "../services/application/preparation.js";
import {
  completeGuidedSubmission,
  getLatestSubmission,
} from "../services/application/submission.js";
import { getApplicationBlueprint } from "../services/applications.js";
import {
  generateGuidanceHints,
  hostFromUrl,
  sanitiseBlockerPatterns,
  sanitiseBlockers,
  sanitiseDetectedFields,
  sanitiseGuidanceText,
  sanitisePlaybookSteps,
  siteKeyForHost,
} from "../services/guidance-policy.js";

/**
 * Guided application sessions.
 *
 * Every statement below is scoped by `response.locals.userId` (the API uses
 * application-level identity scoping, not Postgres RLS). A session can only
 * be opened over an application the caller owns with an approved, immutable
 * preparation; observations never carry a field value into storage.
 *
 * These routes own whole `/applications/...`, `/site-playbooks/...` and
 * `/browser-workspaces/...` paths and are mounted before the general
 * applications router.
 */

type AsyncHandler = (request: Request, response: Response) => Promise<void>;

function route(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function owner(response: Response): string {
  return response.locals.userId as string;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const GUIDANCE_MODES = ["remote_browser", "companion_tab", "email_compose"] as const;
const HINT_ACTIONS = ["fill", "upload", "click_next", "wait_for_user", "stop"] as const;
const ACTIVE_SESSION_STATUSES = ["ACTIVE", "WAITING_FOR_HUMAN"] as const;

const modeSchema = z.enum(GUIDANCE_MODES);
const applicationIdSchema = z.string().uuid();

// Input fields may include a `value` from the page. It is parsed so a client
// can describe what it saw, then immediately discarded by sanitiseDetectedFields.
const detectedFieldSchema = z.object({
  key: z.string().min(1).max(240),
  label: z.string().min(1).max(400),
  type: z.string().max(120),
  required: z.boolean(),
  value: z.string().max(20_000).optional(),
  options: z.array(z.string().max(400)).max(50).optional(),
  manualOnly: z.boolean().optional(),
});

const sessionCreateSchema = z.object({
  mode: modeSchema,
  targetUrl: z.string().url().max(2_048).optional(),
  consent: z.literal(true),
});

const observationSchema = z.object({
  fields: z.array(detectedFieldSchema).max(50).default([]),
  blockers: z.array(z.string().max(500)).max(10).optional(),
  visibleText: z.string().max(20_000).optional(),
});

const playbookStepInput = z.object({
  label: z.string().min(1).max(240),
  action: z.enum(HINT_ACTIONS),
  fieldKey: z.string().max(240).optional(),
  note: z.string().max(600).optional(),
  // Unknown keys are retained here only so the sanitizer can prove it drops
  // `value`/`answer`/credential-shaped properties before persisting a step.
}).passthrough();

const playbookProposeSchema = z.object({
  host: z.string().min(3).max(253).regex(/^[a-z0-9.-]+$/i),
  siteKey: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
  platform: z.string().max(120).optional(),
  steps: z.array(playbookStepInput).min(1).max(30),
  blockerPatterns: z.array(z.string().max(400)).max(20).optional(),
});

interface SessionRow {
  id: string;
  user_id: string;
  application_id: string;
  submission_run_id: string | null;
  mode: string;
  status: string;
  target_url: string | null;
  target_host: string | null;
  site_key: string | null;
  playbook_version: number | null;
  hints: unknown;
  detected_fields: unknown;
  blockers: unknown;
  consent_at: Date;
  last_observation_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface PlaybookRow {
  id: string;
  site_key: string;
  host: string;
  platform: string | null;
  version: number;
  status: string;
  steps: unknown;
  blocker_patterns: unknown;
  confidence: number | string | null;
  created_at: Date;
  updated_at: Date;
}

interface WorkspaceRow {
  id: string;
  user_id: string;
  application_id: string;
  guidance_session_id: string;
  status: string;
  stream_path: string | null;
  target_url: string | null;
  created_at: Date;
  updated_at: Date;
}

function hintsOf(value: unknown): GuidanceHint[] {
  return arrayOf(value).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const hint = raw as Record<string, unknown>;
    if (
      typeof hint.id !== "string" ||
      typeof hint.title !== "string" ||
      typeof hint.body !== "string" ||
      typeof hint.createdAt !== "string"
    ) return [];
    const severity = ["info", "warning", "action"].includes(String(hint.severity))
      ? (hint.severity as GuidanceHint["severity"])
      : "info";
    return [{
      id: hint.id,
      title: hint.title,
      body: hint.body,
      severity,
      ...(typeof hint.suggestedAction === "string" &&
        (HINT_ACTIONS as readonly string[]).includes(hint.suggestedAction)
        ? { suggestedAction: hint.suggestedAction as GuidanceHint["suggestedAction"] }
        : {}),
      ...(typeof hint.targetFieldKey === "string"
        ? { targetFieldKey: hint.targetFieldKey }
        : {}),
      createdAt: hint.createdAt,
      ...(typeof hint.acknowledgedAt === "string"
        ? { acknowledgedAt: hint.acknowledgedAt }
        : {}),
    }];
  });
}

function fieldsOf(value: unknown): GuidanceDetectedField[] {
  return arrayOf(value).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const field = raw as Record<string, unknown>;
    if (typeof field.key !== "string" || typeof field.label !== "string") return [];
    return [{
      key: field.key,
      label: field.label,
      type: typeof field.type === "string" ? field.type : "text",
      required: field.required === true,
      ...(Array.isArray(field.options)
        ? {
            options: field.options.filter(
              (option): option is string => typeof option === "string",
            ),
          }
        : {}),
      ...(field.manualOnly === true ? { manualOnly: true } : {}),
    }];
  });
}

function stringsOf(value: unknown): string[] {
  return arrayOf(value).filter((item): item is string => typeof item === "string");
}

function mapSession(row: SessionRow): ApplicationGuidanceSession {
  return {
    id: row.id,
    applicationId: row.application_id,
    submissionRunId: row.submission_run_id ?? undefined,
    mode: row.mode as GuidanceMode,
    status: row.status as ApplicationGuidanceSession["status"],
    targetUrl: row.target_url ?? undefined,
    targetHost: row.target_host ?? undefined,
    siteKey: row.site_key ?? undefined,
    playbookVersion: row.playbook_version ?? undefined,
    hints: hintsOf(row.hints),
    detectedFields: fieldsOf(row.detected_fields),
    blockers: stringsOf(row.blockers),
    consentAt: row.consent_at.toISOString(),
    lastObservationAt: row.last_observation_at?.toISOString(),
    endedAt: row.ended_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapPlaybook(row: PlaybookRow): SitePlaybook {
  return {
    id: row.id,
    siteKey: row.site_key,
    host: row.host,
    platform: row.platform ?? undefined,
    version: row.version,
    status: row.status as SitePlaybook["status"],
    steps: arrayOf(row.steps).filter((step): step is SitePlaybookStep =>
      !!step && typeof step === "object" && !Array.isArray(step),
    ),
    blockerPatterns: stringsOf(row.blocker_patterns),
    confidence: Number(row.confidence ?? 0.5),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapWorkspace(row: WorkspaceRow): BrowserWorkspace {
  return {
    id: row.id,
    applicationId: row.application_id,
    guidanceSessionId: row.guidance_session_id,
    status: row.status as BrowserWorkspace["status"],
    streamPath: row.stream_path ?? undefined,
    targetUrl: row.target_url ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function assertApplicationOwned(
  userId: string,
  applicationId: string,
): Promise<void> {
  const result = await query<{ id: string }>(
    "SELECT id FROM applications WHERE id = $1 AND user_id = $2",
    [applicationId, userId],
  );
  if (!result.rows[0]) throw new Error("APPLICATION_NOT_FOUND");
}

/** Never weaken this: guidance sits on top of the candidate-approved package. */
async function assertApprovedPreparation(
  userId: string,
  applicationId: string,
): Promise<ApplicationPreparation> {
  const preparation = await getPreparationByApplication(userId, applicationId);
  if (!preparation) throw new Error("PREPARATION_NOT_FOUND");
  if (preparation.status !== "READY" || !preparation.approvedAt) {
    throw new Error(`PREPARATION_NOT_APPROVED:${preparation.status}`);
  }
  if (preparation.missingInputs.length > 0) {
    throw new Error("PREPARATION_MISSING_INPUT");
  }
  if (!(await verifyPreparationApproval(preparation))) {
    throw new Error("PREPARATION_APPROVAL_STALE");
  }
  return preparation;
}

function approvedFieldKeys(
  preparation: ApplicationPreparation,
  blueprintFields: string[],
): string[] {
  const analysisFields = Array.isArray(preparation.analysis.fields)
    ? preparation.analysis.fields
    : [];
  return [...blueprintFields, ...analysisFields.flatMap((field) =>
    field && typeof field === "object" && typeof field.key === "string"
      ? [field.key]
      : [],
  )];
}

async function loadSession(
  userId: string,
  applicationId: string,
  sessionId: string,
  activeOnly = false,
): Promise<SessionRow> {
  const result = await query<SessionRow>(
    `SELECT * FROM application_guidance_sessions
      WHERE id = $1 AND user_id = $2 AND application_id = $3
        AND status <> 'COMPLETED'
        AND ended_at IS NULL`,
    [sessionId, userId, applicationId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("GUIDANCE_SESSION_NOT_FOUND");
  if (activeOnly && !(ACTIVE_SESSION_STATUSES as readonly string[]).includes(row.status)) {
    throw new Error("GUIDANCE_SESSION_CLOSED");
  }
  return row;
}

async function loadCurrentSession(
  userId: string,
  applicationId: string,
): Promise<SessionRow | null> {
  const result = await query<SessionRow>(
    `SELECT * FROM application_guidance_sessions
      WHERE user_id = $1 AND application_id = $2
        AND status = ANY($3::text[])
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1`,
    [userId, applicationId, [...ACTIVE_SESSION_STATUSES]],
  );
  return result.rows[0] ?? null;
}

async function lookupPlaybook(
  host: string | null,
  siteKey: string | null,
): Promise<SitePlaybook | null> {
  const result = await query<PlaybookRow>(
    `SELECT * FROM application_site_playbooks
      WHERE status = 'PUBLISHED'
        AND (($1::text IS NOT NULL AND host = $1)
          OR ($2::text IS NOT NULL AND site_key = $2))
      ORDER BY version DESC, updated_at DESC
      LIMIT 1`,
    [host, siteKey],
  );
  const row = result.rows[0];
  return row ? mapPlaybook(row) : null;
}

export const guidanceRouter = Router();

// ---------------------------------------------------------------------------
// Guidance sessions
// ---------------------------------------------------------------------------

guidanceRouter.post(
  "/applications/:id/guidance/sessions",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const input = sessionCreateSchema.parse(request.body ?? {});
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    await assertApprovedPreparation(userId, applicationId);
    const blueprint = await getApplicationBlueprint(userId, applicationId);
    const latestRun = await getLatestSubmission(userId, applicationId);

    const rawTarget = input.targetUrl ??
      (blueprint.method === "email"
        ? "https://mail.google.com/mail/u/0/#compose"
        : blueprint.applicationUrl);
    // Query strings on an apply URL can carry tracking tokens; keep the URL
    // useful without carrying a credential into the session row.
    const targetUrl = redactUrl(rawTarget);
    const targetHost = hostFromUrl(targetUrl);
    const siteKey = targetHost ? siteKeyForHost(targetHost) || null : null;
    const playbook = await lookupPlaybook(targetHost, siteKey);

    const id = randomUUID();
    const inserted = await query<SessionRow>(
      `INSERT INTO application_guidance_sessions (
         id, user_id, application_id, submission_run_id, mode, status,
         target_url, target_host, site_key, playbook_version,
         hints, detected_fields, blockers, consent_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9,
         '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now()
       )
       RETURNING *`,
      [
        id,
        userId,
        applicationId,
        latestRun?.id ?? null,
        input.mode,
        targetUrl,
        targetHost,
        siteKey,
        playbook?.version ?? null,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("GUIDANCE_SESSION_CREATE_FAILED");
    response.status(201).json({ session: mapSession(row) });
  }),
);

guidanceRouter.get(
  "/applications/:id/guidance/sessions/current",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const userId = owner(response);
    await assertApplicationOwned(userId, applicationId);
    const row = await loadCurrentSession(userId, applicationId);
    response.json({ session: row ? mapSession(row) : null });
  }),
);

guidanceRouter.post(
  "/applications/:id/guidance/sessions/:sessionId/observations",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const sessionId = applicationIdSchema.parse(request.params.sessionId);
    const input = observationSchema.parse(request.body ?? {});
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    const session = await loadSession(userId, applicationId, sessionId, true);
    const fields = sanitiseDetectedFields(input.fields);
    const blockers = sanitiseBlockers(input.blockers ?? []);

    // The visible text is redacted and used only to recognise a sign-in or
    // verification wall. It is never written to a table or a hint body.
    const signal = input.visibleText
      ? sanitiseGuidanceText(input.visibleText, 4_000)
      : "";
    if (/sign in|log in|verif|two[- ]?factor|otp/i.test(signal)) {
      blockers.push(
        "Sign-in or verification is required on this page — complete it yourself.",
      );
    }

    const preparation = await assertApprovedPreparation(userId, applicationId);
    const blueprint = await getApplicationBlueprint(userId, applicationId);
    const playbook = await lookupPlaybook(
      session.target_host,
      session.site_key,
    );
    const newHints = generateGuidanceHints({
      fields,
      blockers,
      approvedFieldKeys: approvedFieldKeys(preparation, blueprint.fields),
      playbook,
    });
    const hints = [...hintsOf(session.hints), ...newHints].slice(-50);
    const needsHuman =
      blockers.length > 0 || fields.some((field) => field.manualOnly === true);

    const updated = await query<SessionRow>(
      `UPDATE application_guidance_sessions
          SET detected_fields = $1::jsonb,
              blockers = $2::jsonb,
              hints = $3::jsonb,
              last_observation_at = now(),
              status = CASE
                WHEN $4::boolean THEN 'WAITING_FOR_HUMAN'
                ELSE status
              END
        WHERE id = $5 AND user_id = $6 AND application_id = $7
          AND status = ANY($8::text[])
        RETURNING *`,
      [
        JSON.stringify(fields),
        JSON.stringify(blockers),
        JSON.stringify(hints),
        needsHuman,
        sessionId,
        userId,
        applicationId,
        [...ACTIVE_SESSION_STATUSES],
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("GUIDANCE_SESSION_NOT_FOUND");
    response.json({ session: mapSession(row) });
  }),
);

guidanceRouter.post(
  "/applications/:id/guidance/sessions/:sessionId/hints/:hintId/ack",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const sessionId = applicationIdSchema.parse(request.params.sessionId);
    const hintId = applicationIdSchema.parse(request.params.hintId);
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    const session = await loadSession(userId, applicationId, sessionId);
    const hints = hintsOf(session.hints);
    const hint = hints.find((item) => item.id === hintId);
    if (!hint) throw new Error("GUIDANCE_HINT_NOT_FOUND");

    const acknowledgedAt = new Date().toISOString();
    const nextHints = hints.map((item) =>
      item.id === hintId ? { ...item, acknowledgedAt } : item,
    );
    const updated = await query<SessionRow>(
      `UPDATE application_guidance_sessions
          SET hints = $1::jsonb
        WHERE id = $2 AND user_id = $3 AND application_id = $4
        RETURNING *`,
      [JSON.stringify(nextHints), sessionId, userId, applicationId],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("GUIDANCE_SESSION_NOT_FOUND");
    response.json({ session: mapSession(row) });
  }),
);

guidanceRouter.post(
  "/applications/:id/guidance/sessions/:sessionId/mode",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const sessionId = applicationIdSchema.parse(request.params.sessionId);
    const input = z.object({ mode: modeSchema }).parse(request.body ?? {});
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    await loadSession(userId, applicationId, sessionId, true);
    const updated = await query<SessionRow>(
      `UPDATE application_guidance_sessions
          SET mode = $1
        WHERE id = $2 AND user_id = $3 AND application_id = $4
          AND status = ANY($5::text[])
        RETURNING *`,
      [
        input.mode,
        sessionId,
        userId,
        applicationId,
        [...ACTIVE_SESSION_STATUSES],
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("GUIDANCE_SESSION_NOT_FOUND");
    response.json({ session: mapSession(row) });
  }),
);

/**
 * Explicit candidate confirmation after the guided browser's submit step.
 * This is the only route that advances a guided run to SUCCEEDED.
 */
guidanceRouter.post(
  "/applications/:id/guidance/sessions/:sessionId/complete",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const sessionId = applicationIdSchema.parse(request.params.sessionId);
    const input = z
      .object({
        url: z.string().url().max(2_000).optional(),
        runId: z.string().uuid().optional(),
      })
      .parse(request.body ?? {});
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    const run = await completeGuidedSubmission(
      userId,
      applicationId,
      sessionId,
      input.url,
      input.runId,
    );
    response.json({ run });
  }),
);

guidanceRouter.post(
  "/applications/:id/guidance/sessions/:sessionId/end",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const sessionId = applicationIdSchema.parse(request.params.sessionId);
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    await loadSession(userId, applicationId, sessionId);
    const updated = await query<SessionRow>(
      `UPDATE application_guidance_sessions
          SET status = 'COMPLETED', ended_at = COALESCE(ended_at, now())
        WHERE id = $1 AND user_id = $2 AND application_id = $3
        RETURNING *`,
      [sessionId, userId, applicationId],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("GUIDANCE_SESSION_NOT_FOUND");
    response.json({ session: mapSession(row) });
  }),
);

// ---------------------------------------------------------------------------
// Site playbooks (never trusted as guidance until an operator publishes them)
// ---------------------------------------------------------------------------

guidanceRouter.get(
  "/site-playbooks/lookup",
  route(async (request, response) => {
    const filters = z
      .object({
        host: z.string().max(253).regex(/^[a-z0-9.-]+$/i).optional(),
        siteKey: z
          .string()
          .max(120)
          .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
          .optional(),
      })
      .parse(request.query);
    if (!filters.host && !filters.siteKey) {
      response.status(400).json({ error: "host or siteKey is required" });
      return;
    }
    const playbook = await lookupPlaybook(
      filters.host?.toLowerCase() ?? null,
      filters.siteKey ?? null,
    );
    response.json({ playbook });
  }),
);

guidanceRouter.post(
  "/site-playbooks/propose",
  route(async (request, response) => {
    const input = playbookProposeSchema.parse(request.body ?? {});
    const userId = owner(response);
    const steps = sanitisePlaybookSteps(input.steps);
    if (steps.length === 0) throw new Error("PLAYBOOK_STEPS_REQUIRED");

    const host = input.host.toLowerCase().replace(/^www\./, "");
    const versioned = await query<{ version: string }>(
      `SELECT COALESCE(max(version), 0) + 1 AS version
         FROM application_site_playbooks
        WHERE site_key = $1`,
      [input.siteKey],
    );
    const version = Number(versioned.rows[0]?.version ?? 1);
    const inserted = await query<PlaybookRow>(
      `INSERT INTO application_site_playbooks (
         site_key, host, platform, version, status, steps, blocker_patterns,
         confidence, proposed_by
       ) VALUES ($1, $2, $3, $4, 'PROPOSED', $5::jsonb, $6::jsonb, 0.50, $7)
       RETURNING *`,
      [
        input.siteKey,
        host,
        sanitiseGuidanceText(input.platform ?? "", 120) || null,
        version,
        JSON.stringify(steps),
        JSON.stringify(sanitiseBlockerPatterns(input.blockerPatterns ?? [])),
        userId,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("PLAYBOOK_CREATE_FAILED");
    response.status(201).json({ playbook: mapPlaybook(row) });
  }),
);

// ---------------------------------------------------------------------------
// Browser workspaces
// ---------------------------------------------------------------------------

guidanceRouter.post(
  "/applications/:id/browser-workspaces",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const input = z
      .object({ guidanceSessionId: applicationIdSchema })
      .parse(request.body ?? {});
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    const session = await loadSession(userId, applicationId, input.guidanceSessionId, true);

    const id = randomUUID();
    const inserted = await query<WorkspaceRow>(
      `INSERT INTO browser_workspaces (
         id, user_id, application_id, guidance_session_id, status,
         stream_path, target_url
       ) VALUES ($1, $2, $3, $4, 'STARTING', $5, $6)
       RETURNING *`,
      [
        id,
        userId,
        applicationId,
        session.id,
        `/v1/browser-workspaces/${id}/stream`,
        session.target_url,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("BROWSER_WORKSPACE_CREATE_FAILED");
    response.status(201).json({ workspace: mapWorkspace(row) });
  }),
);

guidanceRouter.get(
  "/applications/:id/browser-workspaces/current",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const userId = owner(response);
    await assertApplicationOwned(userId, applicationId);

    const result = await query<WorkspaceRow>(
      `SELECT * FROM browser_workspaces
        WHERE user_id = $1 AND application_id = $2
          AND status IN ('STARTING', 'READY', 'BUSY')
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, applicationId],
    );
    const row = result.rows[0];
    response.json({ workspace: row ? mapWorkspace(row) : null });
  }),
);

guidanceRouter.post(
  "/applications/:id/browser-workspaces/:workspaceId/close",
  route(async (request, response) => {
    const applicationId = applicationIdSchema.parse(request.params.id);
    const workspaceId = applicationIdSchema.parse(request.params.workspaceId);
    const userId = owner(response);

    await assertApplicationOwned(userId, applicationId);
    const updated = await query<WorkspaceRow>(
      `UPDATE browser_workspaces
          SET status = 'CLOSED'
        WHERE id = $1 AND user_id = $2 AND application_id = $3
        RETURNING *`,
      [workspaceId, userId, applicationId],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("BROWSER_WORKSPACE_NOT_FOUND");
    response.json({ workspace: mapWorkspace(row) });
  }),
);
