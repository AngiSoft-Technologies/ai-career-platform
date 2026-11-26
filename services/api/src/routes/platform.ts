import type { SavedOpportunity } from "@angisoft/mboqara-contracts";
import { createHash } from "node:crypto";
import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import {
  mapOpportunity,
  opportunitySelectFrom,
  type OpportunityRow,
} from "../services/opportunities.js";
import { logger } from "../logger.js";
import { broadcast } from "../realtime/hub.js";
import { API_VERSION } from "../version.js";
import { userObjectPrefix } from "../services/storage.js";
import { encryptToken, tokenEncryptionEnabled } from "../services/push/secrets.js";
import { recordDeviceRegistration } from "./metrics.js";

/**
 * Platform hardening endpoints.
 *
 * `platformRouter` is mounted after `identity`, so every statement below is
 * scoped by `response.locals.userId`. `publicConfigRouter` is mounted before
 * `identity` and returns only non-personal bootstrap values.
 */

type AsyncHandler = (request: Request, response: Response) => Promise<void>;

/** Express 5 forwards rejected promises, but one wrapper keeps route bodies flat. */
function route(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function owner(response: Response): string {
  return response.locals.userId as string;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

const idSchema = z.string().uuid();
const PROVIDERS = ["fcm", "apns", "huawei", "samsung"] as const;
const CHANNELS = ["in_app", "push", "email"] as const;
const CADENCES = ["realtime", "daily", "weekly"] as const;

// ---------------------------------------------------------------------------
// Public client configuration
// ---------------------------------------------------------------------------

export const publicConfigRouter = Router();

const DEFAULT_CLIENT_CONFIG = {
  minSupportedVersion: "1.0.0",
  forceUpdate: false,
  maintenanceMode: false,
  featureFlags: {} as Record<string, boolean>,
};

publicConfigRouter.get(
  "/client",
  route(async (_request, response) => {
    let values = DEFAULT_CLIENT_CONFIG;
    try {
      const result = await query<{ key: string; value: unknown }>(
        `SELECT key, value FROM remote_config
          WHERE key IN ('min_supported_version', 'force_update', 'maintenance_mode', 'feature_flags')`,
      );
      const byKey = new Map(result.rows.map((row) => [row.key, row.value]));
      values = {
        minSupportedVersion:
          typeof byKey.get("min_supported_version") === "string"
            ? (byKey.get("min_supported_version") as string)
            : DEFAULT_CLIENT_CONFIG.minSupportedVersion,
        forceUpdate: byKey.get("force_update") === true,
        maintenanceMode: byKey.get("maintenance_mode") === true,
        featureFlags:
          typeof byKey.get("feature_flags") === "object" &&
          byKey.get("feature_flags") !== null
            ? (byKey.get("feature_flags") as Record<string, boolean>)
            : {},
      };
    } catch {
      // A missing config table must not stop old clients from starting.
      logger.debug("Remote config unavailable; serving bootstrap defaults");
    }
    response.setHeader("Cache-Control", "public, max-age=60");
    response.json({
      ...values,
      serverTime: new Date().toISOString(),
      apiVersion: API_VERSION,
    });
  }),
);

// ---------------------------------------------------------------------------
// Authenticated platform routes
// ---------------------------------------------------------------------------

export const platformRouter = Router();

interface DeviceRow {
  id: string;
  provider: string;
  token_hint: string;
  device_id: string;
  platform: string;
  app_version: string;
  locale: string;
  topics: string[];
  enabled: boolean;
  last_seen_at: Date;
  created_at: Date;
}

function serializeDevice(row: DeviceRow) {
  return {
    id: row.id,
    provider: row.provider,
    tokenHint: row.token_hint,
    deviceId: row.device_id,
    platform: row.platform,
    appVersion: row.app_version,
    locale: row.locale,
    topics: row.topics,
    enabled: row.enabled,
    lastSeenAt: iso(row.last_seen_at),
    createdAt: iso(row.created_at),
  };
}

platformRouter.get(
  "/me/devices",
  route(async (_request, response) => {
    const result = await query<DeviceRow>(
      `SELECT id, provider, token_hint, device_id, platform, app_version,
              locale, topics, enabled, last_seen_at, created_at
         FROM user_devices WHERE user_id = $1
        ORDER BY last_seen_at DESC`,
      [owner(response)],
    );
    response.json({ items: result.rows.map(serializeDevice) });
  }),
);

const deviceSchema = z.object({
  provider: z.enum(PROVIDERS),
  token: z.string().min(8).max(4096),
  deviceId: z.string().min(1).max(200).default(""),
  platform: z.string().min(1).max(80).default(""),
  appVersion: z.string().min(1).max(80).default(""),
  locale: z.string().min(1).max(40).default(""),
  topics: z.array(z.string().regex(/^[a-z0-9_.-]{1,80}$/)).max(50).default([]),
});

platformRouter.post(
  "/me/devices",
  route(async (request, response) => {
    const parsed = deviceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      recordDeviceRegistration("invalid");
      response.status(400).json({ error: "Invalid device registration" });
      return;
    }
    const input = parsed.data;
    const userId = owner(response);
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    // A 6-character hint is enough to identify a token in support tooling and
    // short enough not to make a hash reversible by guessing.
    const tokenHint = `${input.provider}:${tokenHash.slice(0, 6)}`;
    const ciphertext = tokenEncryptionEnabled()
      ? encryptToken(input.token)
      : null;

    const result = await query<DeviceRow>(
        `INSERT INTO user_devices
           (user_id, provider, token_hash, token_hint, token_ciphertext,
            device_id, platform, app_version, locale, topics, enabled, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, now())
         ON CONFLICT (user_id, provider, token_hash) DO UPDATE SET
           token_hint = EXCLUDED.token_hint,
           token_ciphertext = COALESCE(EXCLUDED.token_ciphertext, user_devices.token_ciphertext),
           device_id = EXCLUDED.device_id,
           platform = EXCLUDED.platform,
           app_version = EXCLUDED.app_version,
           locale = EXCLUDED.locale,
           topics = EXCLUDED.topics,
           enabled = true,
           last_seen_at = now()
         RETURNING id, provider, token_hint, device_id, platform, app_version,
                   locale, topics, enabled, last_seen_at, created_at`,
        [
          userId,
          input.provider,
          tokenHash,
          tokenHint,
          ciphertext,
          input.deviceId,
          input.platform,
          input.appVersion,
          input.locale,
          input.topics,
        ],
      ).catch((error: unknown) => {
        recordDeviceRegistration("error");
        throw error;
      });
    recordDeviceRegistration("ok");
    broadcast("device.registered", { provider: input.provider }, userId);
    response.status(201).json({
      device: serializeDevice(result.rows[0] as DeviceRow),
      // Honest delivery state: without provider credentials or an encryption
      // key the registry is usable but pushes are dry runs.
      pushConfigured: ciphertext !== null,
    });
  }),
);

const deleteDeviceSchema = z.object({
  provider: z.enum(PROVIDERS).optional(),
  token: z.string().min(8).max(4096).optional(),
  deviceId: z.string().min(1).max(200).optional(),
});

platformRouter.delete(
  "/me/devices",
  route(async (request, response) => {
    const input = deleteDeviceSchema.parse(request.body ?? {});
    const userId = owner(response);
    const values: unknown[] = [userId];
    const conditions = ["user_id = $1"];
    if (input.provider) {
      values.push(input.provider);
      conditions.push(`provider = $${values.length}`);
    }
    if (input.token) {
      values.push(createHash("sha256").update(input.token).digest("hex"));
      conditions.push(`token_hash = $${values.length}`);
    }
    if (input.deviceId) {
      values.push(input.deviceId);
      conditions.push(`device_id = $${values.length}`);
    }
    const result = await query<{ id: string }>(
      `DELETE FROM user_devices WHERE ${conditions.join(" AND ")} RETURNING id`,
      values,
    );
    response.json({ deleted: result.rowCount ?? 0 });
  }),
);

// ---------------------------------------------------------------------------
// Saved searches and job alerts
// ---------------------------------------------------------------------------

interface SavedSearchRow {
  id: string;
  name: string;
  query: Record<string, unknown>;
  alert_enabled: boolean;
  cadence: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  channels: string[];
  last_seen_at: Date | null;
  last_evaluated_at: Date | null;
  new_count: number;
  created_at: Date;
  updated_at: Date;
}

function serializeSearch(row: SavedSearchRow) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    alertEnabled: row.alert_enabled,
    cadence: row.cadence,
    quietHours:
      row.quiet_hours_start && row.quiet_hours_end
        ? {
            start: row.quiet_hours_start.slice(0, 5),
            end: row.quiet_hours_end.slice(0, 5),
          }
        : null,
    channels: row.channels,
    lastSeenAt: iso(row.last_seen_at),
    lastEvaluatedAt: iso(row.last_evaluated_at),
    newCount: row.new_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const quietHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const searchQuerySchema = z
  .record(z.string().max(120), z.unknown())
  .refine(
    (value) => JSON.stringify(value).length <= 8_000,
    "Saved search query is too large",
  );

const createSearchSchema = z.object({
  name: z.string().min(1).max(140),
  query: searchQuerySchema.default({}),
  alertEnabled: z.boolean().default(false),
  cadence: z.enum(CADENCES).default("daily"),
  quietHours: quietHoursSchema.nullable().optional(),
  channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length).default(["in_app"]),
});

platformRouter.get(
  "/me/saved-searches",
  route(async (_request, response) => {
    const result = await query<SavedSearchRow>(
      `SELECT id, name, query, alert_enabled, cadence,
              quiet_hours_start::text AS quiet_hours_start,
              quiet_hours_end::text AS quiet_hours_end,
              channels, last_seen_at, last_evaluated_at, new_count,
              created_at, updated_at
         FROM saved_searches WHERE user_id = $1
        ORDER BY updated_at DESC`,
      [owner(response)],
    );
    response.json({ items: result.rows.map(serializeSearch) });
  }),
);

platformRouter.post(
  "/me/saved-searches",
  route(async (request, response) => {
    const input = createSearchSchema.parse(request.body ?? {});
    const result = await query<SavedSearchRow>(
      `INSERT INTO saved_searches
         (user_id, name, query, alert_enabled, cadence,
          quiet_hours_start, quiet_hours_end, channels)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
       RETURNING id, name, query, alert_enabled, cadence,
                 quiet_hours_start::text AS quiet_hours_start,
                 quiet_hours_end::text AS quiet_hours_end,
                 channels, last_seen_at, last_evaluated_at, new_count,
                 created_at, updated_at`,
      [
        owner(response),
        input.name,
        JSON.stringify(input.query),
        input.alertEnabled,
        input.cadence,
        input.quietHours?.start ?? null,
        input.quietHours?.end ?? null,
        input.channels,
      ],
    );
    response.status(201).json({ savedSearch: serializeSearch(result.rows[0] as SavedSearchRow) });
  }),
);

const updateSearchSchema = createSearchSchema.partial();

platformRouter.patch(
  "/me/saved-searches/:id",
  route(async (request, response) => {
    const searchId = idSchema.parse(request.params.id);
    const input = updateSearchSchema.parse(request.body ?? {});
    const result = await query<SavedSearchRow>(
      `UPDATE saved_searches
          SET name = COALESCE($3, name),
              query = COALESCE($4::jsonb, query),
              alert_enabled = COALESCE($5, alert_enabled),
              cadence = COALESCE($6, cadence),
              quiet_hours_start = CASE WHEN $7 THEN $8::time ELSE quiet_hours_start END,
              quiet_hours_end = CASE WHEN $7 THEN $9::time ELSE quiet_hours_end END,
              channels = COALESCE($10, channels)
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, query, alert_enabled, cadence,
                  quiet_hours_start::text AS quiet_hours_start,
                  quiet_hours_end::text AS quiet_hours_end,
                  channels, last_seen_at, last_evaluated_at, new_count,
                  created_at, updated_at`,
      [
        searchId,
        owner(response),
        input.name ?? null,
        input.query ? JSON.stringify(input.query) : null,
        input.alertEnabled ?? null,
        input.cadence ?? null,
        input.quietHours !== undefined,
        input.quietHours?.start ?? null,
        input.quietHours?.end ?? null,
        input.channels ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      response.status(404).json({ error: "Saved search not found" });
      return;
    }
    response.json({ savedSearch: serializeSearch(row) });
  }),
);

platformRouter.delete(
  "/me/saved-searches/:id",
  route(async (request, response) => {
    const searchId = idSchema.parse(request.params.id);
    const result = await query<{ id: string }>(
      "DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 RETURNING id",
      [searchId, owner(response)],
    );
    if (!result.rows[0]) {
      response.status(404).json({ error: "Saved search not found" });
      return;
    }
    response.json({ ok: true, id: searchId });
  }),
);

platformRouter.post(
  "/me/saved-searches/:id/mark-seen",
  route(async (request, response) => {
    const searchId = idSchema.parse(request.params.id);
    const result = await query<{ id: string; new_count: number }>(
      `UPDATE saved_searches
          SET last_seen_at = now(), new_count = 0
        WHERE id = $1 AND user_id = $2
        RETURNING id, new_count`,
      [searchId, owner(response)],
    );
    const row = result.rows[0];
    if (!row) {
      response.status(404).json({ error: "Saved search not found" });
      return;
    }
    response.json({ id: row.id, newCount: row.new_count });
  }),
);

platformRouter.get(
  "/me/job-alerts",
  route(async (_request, response) => {
    const result = await query<SavedSearchRow>(
      `SELECT id, name, query, alert_enabled, cadence,
              quiet_hours_start::text AS quiet_hours_start,
              quiet_hours_end::text AS quiet_hours_end,
              channels, last_seen_at, last_evaluated_at, new_count,
              created_at, updated_at
         FROM saved_searches
        WHERE user_id = $1 AND alert_enabled = true
        ORDER BY new_count DESC, updated_at DESC
        LIMIT 50`,
      [owner(response)],
    );
    const searches = result.rows.map(serializeSearch);
    response.json({
      items: searches,
      total: searches.length,
      unreadCount: searches.reduce((total, item) => total + item.newCount, 0),
      activeCount: searches.length,
    });
  }),
);

// ---------------------------------------------------------------------------
// Privacy, export and account deletion
// ---------------------------------------------------------------------------

interface PrivacyRow {
  allow_analytics: boolean;
  allow_personalisation: boolean;
  screenshot_protection: boolean;
  updated_at: Date;
}

function serializePrivacy(row: PrivacyRow | undefined) {
  return {
    allowAnalytics: row?.allow_analytics ?? false,
    allowPersonalisation: row?.allow_personalisation ?? true,
    screenshotProtection: row?.screenshot_protection ?? false,
    updatedAt: iso(row?.updated_at),
  };
}

platformRouter.get(
  "/me/privacy",
  route(async (_request, response) => {
    const result = await query<PrivacyRow>(
      `SELECT allow_analytics, allow_personalisation, screenshot_protection, updated_at
         FROM user_privacy WHERE user_id = $1`,
      [owner(response)],
    );
    response.json({ privacy: serializePrivacy(result.rows[0]) });
  }),
);

const privacySchema = z.object({
  allowAnalytics: z.boolean().optional(),
  allowPersonalisation: z.boolean().optional(),
  screenshotProtection: z.boolean().optional(),
});

platformRouter.put(
  "/me/privacy",
  route(async (request, response) => {
    const input = privacySchema.parse(request.body ?? {});
    const result = await query<PrivacyRow>(
      `INSERT INTO user_privacy
         (user_id, allow_analytics, allow_personalisation, screenshot_protection, updated_at)
       VALUES ($1, COALESCE($2, false), COALESCE($3, true), COALESCE($4, false), now())
       ON CONFLICT (user_id) DO UPDATE SET
         allow_analytics = COALESCE($2, user_privacy.allow_analytics),
         allow_personalisation = COALESCE($3, user_privacy.allow_personalisation),
         screenshot_protection = COALESCE($4, user_privacy.screenshot_protection),
         updated_at = now()
       RETURNING allow_analytics, allow_personalisation, screenshot_protection, updated_at`,
      [
        owner(response),
        input.allowAnalytics ?? null,
        input.allowPersonalisation ?? null,
        input.screenshotProtection ?? null,
      ],
    );
    response.json({ privacy: serializePrivacy(result.rows[0]) });
  }),
);

platformRouter.get(
  "/me/export",
  route(async (_request, response) => {
    const userId = owner(response);
    // Each query is restricted to the caller. No join may pull another
    // user's rows into this bundle.
    const [users, profiles, preferences, applications, followups, documents, notifications, searches] =
      await Promise.all([
        query(
          `SELECT id, email, display_name, created_at FROM users WHERE id = $1`,
          [userId],
        ),
        query(`SELECT * FROM candidate_profiles WHERE user_id = $1`, [userId]),
        query(`SELECT * FROM candidate_preferences WHERE user_id = $1`, [userId]),
        query(`SELECT * FROM applications WHERE user_id = $1`, [userId]),
        query(`SELECT * FROM followups WHERE user_id = $1`, [userId]),
        query(`SELECT * FROM documents WHERE user_id = $1`, [userId]),
        query(`SELECT * FROM notifications WHERE user_id = $1`, [userId]),
        query(`SELECT * FROM saved_searches WHERE user_id = $1`, [userId]),
      ]);

    response.setHeader("Cache-Control", "no-store");
    response.json({
      generatedAt: new Date().toISOString(),
      user: users.rows[0] ?? null,
      profile: profiles.rows[0] ?? null,
      preferences: preferences.rows[0] ?? null,
      applications: applications.rows,
      followups: followups.rows,
      documents: documents.rows,
      notifications: notifications.rows,
      savedSearches: searches.rows,
    });
  }),
);

platformRouter.delete(
  "/me",
  route(async (_request, response) => {
    const userId = owner(response);
    // Keep the row (and therefore the audit trail's FK) but remove its PII.
    await query(
      `UPDATE users
          SET display_name = 'Deleted user',
              email = $2,
              updated_at = now()
        WHERE id = $1`,
      [userId, `deleted-${userId}@invalid.local`],
    );
    // All sessions and device tokens stop working immediately. Access tokens
    // already in flight expire on their own short TTL.
    await query(
      `UPDATE auth_refresh_tokens SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await query("DELETE FROM user_devices WHERE user_id = $1", [userId]);
    await query(
      `UPDATE auth_password_reset_tokens SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1`,
      [userId],
    ).catch(() => undefined);
    await query(
      `UPDATE auth_verification_challenges SET consumed_at = COALESCE(consumed_at, now())
        WHERE user_id = $1`,
      [userId],
    ).catch(() => undefined);
    await query(
      `INSERT INTO audit_events (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'account.anonymised', 'user', $1, '{"anonymised":true}'::jsonb)`,
      [userId],
    );
    response.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Application timeline, interviews, notes, attachments and calendar
// ---------------------------------------------------------------------------

async function ownedApplication(applicationId: string, userId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    "SELECT id FROM applications WHERE id = $1 AND user_id = $2",
    [applicationId, userId],
  );
  return Boolean(result.rows[0]);
}

interface TimelineRow {
  kind: string;
  at: Date;
  title: string;
  body: string;
}

async function timelineRows(applicationId: string, userId: string): Promise<TimelineRow[]> {
  const result = await query<TimelineRow>(
    `SELECT 'status' AS kind, ae.created_at AS at,
            COALESCE(ae.to_status, '') AS title, ae.note AS body
       FROM application_events ae
       JOIN applications a ON a.id = ae.application_id
      WHERE ae.application_id = $1 AND a.user_id = $2
     UNION ALL
     SELECT 'interview', i.starts_at, i.stage,
            COALESCE(i.location, '') || ' ' || COALESCE(i.contact, '') || ' ' || COALESCE(i.notes, '')
       FROM application_interviews i
      WHERE i.application_id = $1 AND i.user_id = $2
     UNION ALL
     SELECT 'note', n.created_at, 'Note', n.body
       FROM application_notes n
      WHERE n.application_id = $1 AND n.user_id = $2
     UNION ALL
     SELECT 'attachment', t.created_at, t.file_name, t.mime_type
       FROM application_attachments t
      WHERE t.application_id = $1 AND t.user_id = $2
     UNION ALL
     SELECT 'followup', f.due_at, f.status, f.note
       FROM followups f
      WHERE f.application_id = $1 AND f.user_id = $2
     ORDER BY at ASC`,
    [applicationId, userId],
  );
  return result.rows;
}

platformRouter.get(
  "/applications/:id/timeline",
  route(async (request, response) => {
    const applicationId = idSchema.parse(request.params.id);
    const userId = owner(response);
    if (!(await ownedApplication(applicationId, userId))) {
      response.status(404).json({ error: "Application not found" });
      return;
    }
    const rows = await timelineRows(applicationId, userId);
    response.json({
      items: rows.map((row) => ({
        kind: row.kind,
        at: iso(row.at),
        title: row.title,
        body: row.body,
      })),
    });
  }),
);

const interviewSchema = z.object({
  stage: z.string().min(1).max(80).default("screening"),
  startsAt: z.string().datetime(),
  location: z.string().max(500).default(""),
  contact: z.string().max(500).default(""),
  notes: z.string().max(5_000).default(""),
});

platformRouter.post(
  "/applications/:id/interviews",
  route(async (request, response) => {
    const applicationId = idSchema.parse(request.params.id);
    const input = interviewSchema.parse(request.body ?? {});
    const userId = owner(response);
    if (!(await ownedApplication(applicationId, userId))) {
      response.status(404).json({ error: "Application not found" });
      return;
    }
    const result = await query<{ id: string; starts_at: Date }>(
      `INSERT INTO application_interviews
         (application_id, user_id, stage, starts_at, location, contact, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, starts_at`,
      [applicationId, userId, input.stage, input.startsAt, input.location, input.contact, input.notes],
    );
    const interview = result.rows[0];
    broadcast("application.interview.added", { applicationId, id: interview?.id }, userId);
    response.status(201).json({ interview });
  }),
);

const noteSchema = z.object({ body: z.string().min(1).max(20_000) });

platformRouter.post(
  "/applications/:id/notes",
  route(async (request, response) => {
    const applicationId = idSchema.parse(request.params.id);
    const input = noteSchema.parse(request.body ?? {});
    const userId = owner(response);
    if (!(await ownedApplication(applicationId, userId))) {
      response.status(404).json({ error: "Application not found" });
      return;
    }
    const result = await query<{ id: string; body: string; created_at: Date }>(
      `INSERT INTO application_notes (application_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at`,
      [applicationId, userId, input.body],
    );
    response.status(201).json({ note: result.rows[0] });
  }),
);

const attachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  storageKey: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(120).default("application/octet-stream"),
});

platformRouter.post(
  "/applications/:id/attachments",
  route(async (request, response) => {
    const applicationId = idSchema.parse(request.params.id);
    const input = attachmentSchema.parse(request.body ?? {});
    const userId = owner(response);
    if (!(await ownedApplication(applicationId, userId))) {
      response.status(404).json({ error: "Application not found" });
      return;
    }
    // A storage key from another user's prefix must never be attachable.
    if (!input.storageKey.startsWith(userObjectPrefix(userId))) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    const result = await query<{
      id: string;
      file_name: string;
      storage_key: string;
      mime_type: string;
      created_at: Date;
    }>(
      `INSERT INTO application_attachments
         (application_id, user_id, file_name, storage_key, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, file_name, storage_key, mime_type, created_at`,
      [applicationId, userId, input.fileName, input.storageKey, input.mimeType],
    );
    response.status(201).json({ attachment: result.rows[0] });
  }),
);

interface CalendarRow {
  starts_at: Date;
  title: string;
  location: string;
}

function icsDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

platformRouter.get(
  "/applications/:id/calendar.ics",
  route(async (request, response) => {
    const applicationId = idSchema.parse(request.params.id);
    const userId = owner(response);
    if (!(await ownedApplication(applicationId, userId))) {
      response.status(404).json({ error: "Application not found" });
      return;
    }
    const result = await query<CalendarRow>(
      `SELECT starts_at, stage AS title, location FROM application_interviews
        WHERE application_id = $1 AND user_id = $2
      UNION ALL
       SELECT f.due_at AS starts_at, 'Follow-up: ' || f.status AS title, '' AS location
         FROM followups f
        WHERE f.application_id = $1 AND f.user_id = $2
        ORDER BY starts_at`,
      [applicationId, userId],
    );
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AngiSoft Technologies//MboQara//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    for (const [index, row] of result.rows.entries()) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${applicationId}-${index}@mboqara`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(row.starts_at)}`,
        `SUMMARY:${icsEscape(row.title)}`,
        `LOCATION:${icsEscape(row.location ?? "")}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT1H",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEscape(row.title)}`,
        "END:VALARM",
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    response
      .setHeader("Content-Type", "text/calendar; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="application-${applicationId}.ics"`)
      .send(`${lines.join("\r\n")}\r\n`);
  }),
);

// ---------------------------------------------------------------------------
// Feed state
// ---------------------------------------------------------------------------

const feedStateSchema = z.object({
  opportunityId: idSchema,
  seen: z.boolean().optional(),
  saved: z.boolean().optional(),
  applied: z.boolean().optional(),
});

const feedStateBodySchema = z.union([
  feedStateSchema,
  z.object({ items: z.array(feedStateSchema).min(1).max(200) }),
]);

platformRouter.post(
  "/feed/state",
  route(async (request, response) => {
    const input = feedStateBodySchema.parse(request.body ?? {});
    const items = "items" in input ? input.items : [input];
    for (const item of items) {
      await query(
        `INSERT INTO feed_state (user_id, opportunity_id, seen_at, saved_at, applied_at)
         VALUES ($1, $2, CASE WHEN $3 THEN now() END,
                 CASE WHEN $4 THEN now() END, CASE WHEN $5 THEN now() END)
         ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
           seen_at = COALESCE(feed_state.seen_at, EXCLUDED.seen_at),
           -- Seen and applied are monotonic; saving is reversible. An explicit
           -- saved:false clears saved_at; an omitted saved leaves it be.
           saved_at = CASE
             WHEN $4::boolean IS NULL THEN feed_state.saved_at
             WHEN $4::boolean THEN COALESCE(feed_state.saved_at, now())
             ELSE NULL
           END,
           applied_at = COALESCE(feed_state.applied_at, EXCLUDED.applied_at)`,
        [owner(response), item.opportunityId, item.seen === true, item.saved ?? null, item.applied === true],
      );
    }
    response.json({ ok: true, updated: items.length });
  }),
);

interface FeedStateRow {
  opportunity_id: string;
  seen_at: Date | null;
  saved_at: Date | null;
  applied_at: Date | null;
}

/**
 * The wish list. This reads the full role through the catalogue mapper so a
 * saved row renders exactly as it did in the feed, newest save first.
 */
platformRouter.get(
  "/feed/state/saved",
  route(async (request, response) => {
    const filters = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query);

    const result = await query<OpportunityRow & { saved_at: Date }>(
      `${opportunitySelectFrom(`
         FROM feed_state fs
         JOIN opportunities o ON o.id = fs.opportunity_id
         JOIN companies c ON c.id = o.company_id
         LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
       `)}
        WHERE fs.user_id = $1
          AND fs.saved_at IS NOT NULL
        GROUP BY o.id, c.id, fs.saved_at
        ORDER BY fs.saved_at DESC, o.id ASC
        LIMIT $2`,
      [owner(response), filters.limit],
    );

    const items: SavedOpportunity[] = result.rows.flatMap((row) => {
      const savedAt = iso(row.saved_at);
      return savedAt ? [{ opportunity: mapOpportunity(row), savedAt }] : [];
    });
    response.json({ items });
  }),
);

platformRouter.get(
  "/feed/state",
  route(async (request, response) => {
    const filters = z
      .object({
        // Express' simple query parser yields a string for a single `ids`.
        ids: z
          .union([z.array(idSchema), idSchema])
          .transform((value) => (Array.isArray(value) ? value : [value]))
          .optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query);
    if (filters.ids && filters.ids.length > 200) {
      response.status(400).json({ error: "Too many ids" });
      return;
    }
    const result = await query<FeedStateRow>(
      `SELECT opportunity_id, seen_at, saved_at, applied_at
         FROM feed_state
        WHERE user_id = $1
          AND ($2::uuid[] IS NULL OR opportunity_id = ANY($2))
        ORDER BY GREATEST(seen_at, saved_at, applied_at) DESC NULLS LAST
        LIMIT $3`,
      [owner(response), filters.ids ?? null, filters.limit],
    );
    response.json({
      items: result.rows.map((row) => ({
        opportunityId: row.opportunity_id,
        seenAt: iso(row.seen_at),
        savedAt: iso(row.saved_at),
        appliedAt: iso(row.applied_at),
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// Document versions (the documents router already owns POST /:id/versions)
// ---------------------------------------------------------------------------

interface DocumentVersionRow {
  id: string;
  title: string;
  content: string;
  template: string | null;
  parent_document_id: string | null;
  created_at: Date;
}

platformRouter.get(
  "/documents/:id/versions",
  route(async (request, response) => {
    const documentId = idSchema.parse(request.params.id);
    const userId = owner(response);
    const result = await query<DocumentVersionRow>(
      `WITH RECURSIVE chain AS (
         SELECT id, title, content, template, parent_document_id, created_at
           FROM documents WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT d.id, d.title, d.content, d.template, d.parent_document_id, d.created_at
           FROM documents d JOIN chain c ON d.parent_document_id = c.id
          WHERE d.user_id = $2
       )
       SELECT id, title, content, template, parent_document_id, created_at
         FROM chain ORDER BY created_at DESC`,
      [documentId, userId],
    );
    if (result.rows.length === 0) {
      response.status(404).json({ error: "Document not found" });
      return;
    }
    response.json({
      items: result.rows.map((row, index) => ({
        id: row.id,
        version: result.rows.length - index,
        title: row.title,
        content: row.content,
        template: row.template,
        parentDocumentId: row.parent_document_id,
        createdAt: iso(row.created_at),
      })),
    });
  }),
);

platformRouter.post(
  "/documents/:id/versions/:version/restore",
  route(async (request, response) => {
    const documentId = idSchema.parse(request.params.id);
    const versionId = idSchema.parse(request.params.version);
    const userId = owner(response);
    const source = await query<DocumentVersionRow>(
      `SELECT id, title, content, template, parent_document_id, created_at
         FROM documents WHERE id = $1 AND user_id = $2`,
      [versionId, userId],
    );
    const row = source.rows[0];
    if (!row) {
      response.status(404).json({ error: "Document version not found" });
      return;
    }
    const root = await query<{ id: string }>(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_document_id FROM documents WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT d.id, d.parent_document_id FROM documents d
           JOIN chain c ON d.id = c.parent_document_id WHERE d.user_id = $2
       )
       SELECT id FROM chain WHERE id = $3`,
      [documentId, userId, versionId],
    );
    if (!root.rows[0]) {
      response.status(404).json({ error: "Document version not found" });
      return;
    }
    const restored = await query<{ id: string; created_at: Date }>(
      `INSERT INTO documents
         (user_id, opportunity_id, application_id, parent_document_id, type, title, content, template)
       SELECT user_id, opportunity_id, application_id, $3, type, title, content, template
         FROM documents WHERE id = $1 AND user_id = $2
       RETURNING id, created_at`,
      [versionId, userId, documentId],
    );
    broadcast("document.restored", { documentId: restored.rows[0]?.id }, userId);
    response.status(201).json({ document: restored.rows[0] });
  }),
);

// ---------------------------------------------------------------------------
// Consent-gated analytics
// ---------------------------------------------------------------------------

export const ANALYTICS_EVENTS = [
  "search",
  "view_job",
  "save_job",
  "match_view",
  "apply_start",
  "apply_submit",
  "doc_generate",
  "doc_export",
  "followup_set",
  "notification_open",
] as const;

const ANALYTICS_PII_KEYS = new Set([
  "email", "name", "fullname", "phone", "address", "token", "password",
  "authorization", "refresh_token", "access_token", "account", "userid",
]);
const SCALAR = z.union([z.string().max(120), z.number(), z.boolean(), z.null()]);

const analyticsSchema = z.object({
  event: z.enum(ANALYTICS_EVENTS),
  properties: z.record(z.string().max(120), SCALAR).default({}),
  consent: z.boolean().default(false),
});

platformRouter.post(
  "/analytics/events",
  route(async (request, response) => {
    const input = analyticsSchema.parse(request.body ?? {});
    const userId = owner(response);
    const properties = Object.fromEntries(
      Object.entries(input.properties).filter(
        ([key]) => !ANALYTICS_PII_KEYS.has(key.toLowerCase()),
      ),
    );
    const privacy = await query<{ allow_analytics: boolean }>(
      "SELECT allow_analytics FROM user_privacy WHERE user_id = $1",
      [userId],
    );
    // `user_privacy` defaults to opt-out; an explicit row has to opt in.
    const consent = input.consent && privacy.rows[0]?.allow_analytics === true;
    await query(
      `INSERT INTO analytics_events (user_id, event, properties, consent)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [userId, input.event, JSON.stringify(properties), consent],
    );
    response.status(202).json({ ok: true });
  }),
);

