import { query } from "../db/pool.js";
import { logger } from "../logger.js";
import { inQuietHours } from "./push/delivery.js";
import { notify } from "./notifications.js";

/**
 * Saved-search alert evaluation and calendar reminders.
 *
 * Both jobs are intentionally idempotent in effect: a run with no rows does
 * nothing, and a reminder already written in the last two hours is not sent
 * twice. Failures are contained per row so one malformed saved query cannot
 * stop the rest of the batch.
 */

interface SavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  query: Record<string, unknown>;
  cadence: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  last_evaluated_at: Date | null;
  last_seen_at: Date | null;
}

function text(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, max)
    : null;
}

function dueForCadence(row: SavedSearchRow): boolean {
  if (!row.last_evaluated_at) return true;
  const ageMs = Date.now() - new Date(row.last_evaluated_at).getTime();
  const cadenceMs = row.cadence === "weekly"
    ? 7 * 24 * 60 * 60_000
    : row.cadence === "daily"
      ? 24 * 60 * 60_000
      : 5 * 60_000;
  return ageMs >= cadenceMs;
}

async function countMatches(
  search: SavedSearchRow,
  since: Date | null,
): Promise<{ total: number; fresh: number }> {
  const filters = search.query ?? {};
  const term =
    text(filters.q) ??
    text(filters.query) ??
    (Array.isArray(filters.keywords)
      ? text(filters.keywords[0])
      : null);
  const result = await query<{ total: number; fresh: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE o.created_at > $1)::int AS fresh
       FROM opportunities o
      WHERE o.status = 'active'
        AND ($2::text IS NULL OR o.country = $2)
        AND ($3::text IS NULL OR o.work_mode = $3)
        AND ($4::text IS NULL OR o.seniority = $4)
        AND ($5::text IS NULL OR o.search_vector @@ plainto_tsquery('english', $5))`,
    [
      since,
      text(filters.country, 80),
      text(filters.workMode, 40),
      text(filters.seniority, 40),
      term,
    ],
  );
  return {
    total: result.rows[0]?.total ?? 0,
    fresh: result.rows[0]?.fresh ?? 0,
  };
}

export async function evaluateSavedSearchAlerts(): Promise<{
  evaluated: number;
  notified: number;
  skipped: number;
}> {
  const result = await query<SavedSearchRow>(
    `SELECT id, user_id, name, query, cadence,
            quiet_hours_start::text AS quiet_hours_start,
            quiet_hours_end::text AS quiet_hours_end,
            last_evaluated_at, last_seen_at
       FROM saved_searches
      WHERE alert_enabled = true
      ORDER BY COALESCE(last_evaluated_at, 'epoch'::timestamptz) ASC
      LIMIT 200`,
  );

  let evaluated = 0;
  let notified = 0;
  let skipped = 0;

  for (const search of result.rows) {
    try {
      if (
        search.quiet_hours_start &&
        search.quiet_hours_end &&
        inQuietHours({
          quiet_hours_start: search.quiet_hours_start,
          quiet_hours_end: search.quiet_hours_end,
        })
      ) {
        skipped += 1;
        continue;
      }
      if (!dueForCadence(search)) continue;

      const since = search.last_evaluated_at ?? search.last_seen_at;
      const matches = await countMatches(search, since);
      const unread = search.last_seen_at
        ? matches.fresh
        : matches.total;

      await query(
        `UPDATE saved_searches
            SET last_evaluated_at = now(), new_count = $3
          WHERE id = $1 AND user_id = $2`,
        [search.id, search.user_id, unread],
      );
      evaluated += 1;

      if (unread > 0) {
        await notify(search.user_id, {
          type: "match",
          title: `${search.name}: ${unread} new ${unread === 1 ? "role" : "roles"}`,
          body: "Open your saved search to review the latest matches.",
          topic: "jobs",
        });
        notified += 1;
      }
    } catch (error) {
      logger.warn(
        { savedSearchId: search.id, error: error instanceof Error ? error.message : "unknown" },
        "Saved-search alert evaluation failed for one row",
      );
    }
  }

  return { evaluated, notified, skipped };
}

interface DueReminder {
  user_id: string;
  title: string;
  body: string;
  key: string;
}

async function alreadyReminded(
  userId: string,
  title: string,
  key: string,
): Promise<boolean> {
  // The reminder key travels in the body as a short marker so an identical
  // reminder is not duplicated on the next tick, without adding a column to
  // the shared notification inbox.
  const result = await query<{ id: string }>(
    `SELECT id FROM notifications
      WHERE user_id = $1 AND title = $2
        AND body LIKE '%' || $3 || '%'
        AND created_at > now() - interval '2 hours'
      LIMIT 1`,
    [userId, title, key],
  );
  return Boolean(result.rows[0]);
}

export async function enqueueCalendarReminders(): Promise<{
  considered: number;
  sent: number;
}> {
  const result = await query<DueReminder>(
    `SELECT f.user_id,
            'Follow-up reminder' AS title,
            COALESCE(NULLIF(f.note, ''), 'A follow-up is due soon.') AS body,
            'followup:' || f.id::text AS key
       FROM followups f
      WHERE f.status = 'PENDING'
        AND f.due_at BETWEEN now() AND now() + interval '1 hour'
     UNION ALL
     SELECT i.user_id,
            'Interview reminder',
            'Interview at ' || to_char(i.starts_at AT TIME ZONE 'UTC', 'HH24:MI') || ' UTC',
            'interview:' || i.id::text
       FROM application_interviews i
      WHERE i.starts_at BETWEEN now() AND now() + interval '1 hour'
      LIMIT 100`,
  );

  let sent = 0;
  for (const reminder of result.rows) {
    try {
      if (await alreadyReminded(reminder.user_id, reminder.title, reminder.key)) {
        continue;
      }
      await notify(reminder.user_id, {
        type: "followup",
        title: reminder.title,
        body: `${reminder.body} [${reminder.key}]`,
        topic: "calendar",
      });
      sent += 1;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : "unknown" },
        "Calendar reminder failed for one row",
      );
    }
  }
  return { considered: result.rows.length, sent };
}
