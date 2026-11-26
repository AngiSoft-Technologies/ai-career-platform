import { query } from "../../db/pool.js";
import { recordNotificationDelivery } from "../../routes/metrics.js";
import { PUSH_PROVIDERS, type PushDevice, type PushProvider } from "./types.js";
import { pushRegistry } from "./adapters.js";

export interface PushDispatchInput {
  type: string;
  title: string;
  body?: string;
  /** Device topic this message belongs to; blank means every device. */
  topic?: string;
  /** Transactional messages are not suppressed by personalisation opt-out. */
  transactional?: boolean;
}

interface DeviceRow {
  provider: string;
  token_hash: string;
  token_hint: string;
  token_ciphertext: string | null;
  device_id: string;
  topics: string[];
}

interface QuietHoursRow {
  quiet_hours_start: string;
  quiet_hours_end: string;
}

function minutesOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Quiet hours are stored as local wall-clock times interpreted in UTC. */
export function inQuietHours(
  row: QuietHoursRow,
  now: Date = new Date(),
): boolean {
  const start = parseTime(row.quiet_hours_start);
  const end = parseTime(row.quiet_hours_end);
  if (start === null || end === null || start === end) return false;
  const current = minutesOfDay(now);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

async function quietHoursFor(userId: string): Promise<QuietHoursRow | null> {
  // A user can have several alert rows; any one of them defining a quiet
  // window applies to push delivery, which is the conservative reading.
  const result = await query<QuietHoursRow>(
    `SELECT quiet_hours_start::text AS quiet_hours_start,
            quiet_hours_end::text AS quiet_hours_end
       FROM saved_searches
      WHERE user_id = $1
        AND alert_enabled = true
        AND quiet_hours_start IS NOT NULL
        AND quiet_hours_end IS NOT NULL
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function personalisationAllowed(userId: string): Promise<boolean> {
  const result = await query<{ allow_personalisation: boolean }>(
    "SELECT allow_personalisation FROM user_privacy WHERE user_id = $1",
    [userId],
  );
  return result.rows[0]?.allow_personalisation !== false;
}

function isProvider(value: string): value is PushProvider {
  return (PUSH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Sends (or dry-runs) push notifications for a notification that has already
 * been written to the inbox. Never throws: a delivery problem can never turn
 * the primary operation into a failure.
 */
export async function dispatchPush(
  userId: string,
  input: PushDispatchInput,
): Promise<void> {
  try {
    if (!input.transactional && !(await personalisationAllowed(userId))) return;
    const quiet = await quietHoursFor(userId);
    if (quiet && inQuietHours(quiet)) {
      recordNotificationDelivery("skipped", "none");
      return;
    }

    const result = await query<DeviceRow>(
      `SELECT provider, token_hash, token_hint, token_ciphertext, device_id, topics
         FROM user_devices
        WHERE user_id = $1 AND enabled = true
        ORDER BY last_seen_at DESC`,
      [userId],
    );
    if (result.rows.length === 0) return;

    const registry = pushRegistry();
    const payload = {
      title: input.title,
      body: input.body ?? "",
      topic: input.topic,
      data: { notificationType: input.type },
    };

    for (const row of result.rows) {
      if (!isProvider(row.provider)) continue;
      if (
        input.topic &&
        row.topics.length > 0 &&
        !row.topics.includes(input.topic)
      ) {
        continue;
      }
      const device: PushDevice = {
        provider: row.provider,
        tokenHash: row.token_hash,
        tokenHint: row.token_hint,
        tokenCiphertext: row.token_ciphertext,
        deviceId: row.device_id,
        topics: row.topics,
      };
      try {
        const outcome = await registry[row.provider].send(device, payload);
        recordNotificationDelivery(outcome.outcome, row.provider);
      } catch {
        // A single adapter must not starve the other devices.
        recordNotificationDelivery("failed", row.provider);
      }
    }
  } catch {
    // Delivery is a side effect of a write that already succeeded.
  }
}
