import { logger } from "../logger.js";
import { query } from "../db/pool.js";

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
}

/**
 * Record a user-facing notification.
 *
 * This is deliberately fire-and-forget: a notification is a side effect of an
 * operation that already succeeded, so a failure to record it must never turn
 * that success into an error for the caller.
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
