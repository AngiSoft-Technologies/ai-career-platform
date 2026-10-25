import { query } from "../db/pool.js";

export interface FollowUpRecord {
  id: string;
  applicationId: string;
  opportunityTitle: string | null;
  companyName: string | null;
  dueAt: string;
  status: string;
  channel: string;
  note: string;
  createdAt: string;
}

export async function listFollowUps(
  userId: string,
  status?: string,
): Promise<FollowUpRecord[]> {
  const result = await query<{
    id: string;
    application_id: string;
    opportunity_title: string | null;
    company_name: string | null;
    due_at: Date;
    status: string;
    channel: string;
    note: string;
    created_at: Date;
  }>(
    `SELECT f.id, f.application_id, o.title AS opportunity_title, c.name AS company_name,
            f.due_at, f.status, f.channel, f.note, f.created_at
       FROM followups f
       JOIN applications a ON a.id = f.application_id
       JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN companies c ON c.id = o.company_id
      WHERE f.user_id = $1
        AND ($2::text IS NULL OR f.status = $2)
      ORDER BY f.due_at ASC
      LIMIT 300`,
    [userId, status ?? null],
  );

  return result.rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    opportunityTitle: row.opportunity_title,
    companyName: row.company_name,
    dueAt: row.due_at.toISOString(),
    status: row.status,
    channel: row.channel,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  }));
}
