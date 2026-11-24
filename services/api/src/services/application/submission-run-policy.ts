export const ACTIVE_SUBMISSION_STATUSES = [
  "REQUESTED",
  "CLAIMED",
  "RUNNING",
  "WAITING_FOR_INPUT",
  "WAITING_FOR_HUMAN",
] as const;

export type ActiveSubmissionStatus = typeof ACTIVE_SUBMISSION_STATUSES[number];

/**
 * SQL literal used by both active-run lookups and the partial unique-index
 * conflict target. Keeping one fragment prevents a new status from being
 * added to one query but forgotten in the other.
 */
export const ACTIVE_SUBMISSION_STATUS_SQL =
  "'REQUESTED', 'CLAIMED', 'RUNNING', 'WAITING_FOR_INPUT', 'WAITING_FOR_HUMAN'";

export const ACTIVE_SUBMISSION_CONFLICT_SQL = `
  ON CONFLICT (application_id)
    WHERE status IN (${ACTIVE_SUBMISSION_STATUS_SQL})
    DO NOTHING`;

export function isActiveSubmissionStatus(status: string): boolean {
  return (ACTIVE_SUBMISSION_STATUSES as readonly string[]).includes(status);
}
