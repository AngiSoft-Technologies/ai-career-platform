import { logger } from "../logger.js";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";
import { dispatchPush } from "./push/delivery.js";

export type NotificationType =
  | "application"
  | "document"
  | "match"
  | "followup"
  | "system";

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  /** Optional device topic, used to filter push delivery. Never user data. */
  topic?: string;
}

/** Alerts tied to an action the user took are not subject to marketing opt-out. */
const TRANSACTIONAL_TYPES: ReadonlySet<NotificationType> = new Set([
  "application",
  "document",
  "followup",
  "system",
]);

/**
 * Record a user-facing notification.
 *
 * This is deliberately fire-and-forget: a notification is a side effect of an
 * operation that already succeeded, so a failure to record it must never turn
 * that success into an error for the caller.
 *
 * The write is also announced on the realtime channel. The bell in the app
 * used to poll for the unread count every minute, which meant a request per
 * user per minute to answer a question the server already knew the answer
 * to; the push is the answer arriving instead of being asked for.
 */
export async function notify(
  userId: string,
  input: NotificationInput,
): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, $2, $3, $4)`,
      [userId, input.type, input.title, input.body ?? ""],
    );
    broadcast("notification.created", { type: input.type }, userId);

    // Push is an optional second channel. It stays fire-and-forget: no await
    // here, and no provider failure may change the response to the caller.
    void dispatchPush(userId, {
      type: input.type,
      title: input.title,
      body: input.body,
      topic: input.topic,
      transactional: TRANSACTIONAL_TYPES.has(input.type),
    }).catch(() => undefined);
  } catch (error) {
    logger.warn(
      { err: error, userId, type: input.type },
      "notification write failed",
    );
  }
}

/** `APPLICATION_PREPARATION` → `Application preparation`. */
export function humanizeStatus(status: string): string {
  const words = status.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
