import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";
import { notify } from "../services/notifications.js";

export const followupsRouter = Router();

const createSchema = z.object({
  dueAt: z.string().datetime(),
  channel: z.enum(["email", "whatsapp", "linkedin", "phone", "manual"]).default("email"),
  note: z.string().max(2000).default(""),
});

const updateSchema = z.object({
  status: z.enum(["PENDING", "SENT", "COMPLETED", "CANCELLED", "OVERDUE"]).optional(),
  note: z.string().max(2000).optional(),
  dueAt: z.string().datetime().optional(),
});

followupsRouter.get("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const status = typeof request.query.status === "string" ? request.query.status : undefined;

    const result = await query(
      `SELECT f.id, f.application_id, f.due_at, f.status, f.channel, f.note,
              f.completed_at, f.created_at,
              o.title AS opportunity_title, c.name AS company_name
         FROM followups f
         JOIN applications a ON a.id = f.application_id
         JOIN opportunities o ON o.id = a.opportunity_id
         JOIN companies c ON c.id = o.company_id
        WHERE f.user_id = $1
          AND ($2::text IS NULL OR f.status = $2)
        ORDER BY f.due_at ASC
        LIMIT 300`,
      [userId, status ?? null],
    );

    const items = result.rows.map((row) => ({
      id: row.id,
      applicationId: row.application_id,
      opportunityTitle: row.opportunity_title,
      companyName: row.company_name,
      dueAt: row.due_at,
      status: row.status,
      channel: row.channel,
      note: row.note,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    }));

    response.json({ items, total: items.length });
  } catch (error) {
    next(error);
  }
});

followupsRouter.patch("/:id", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const followupId = z.string().uuid().parse(request.params.id);
    const input = updateSchema.parse(request.body);

    const result = await query(
      `UPDATE followups
          SET status = COALESCE($3, status),
              note = COALESCE($4, note),
              due_at = COALESCE($5, due_at),
              completed_at = CASE
                WHEN $3 = 'COMPLETED' THEN now()
                WHEN $3 = 'PENDING' THEN NULL
                ELSE completed_at
              END,
              updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, status, due_at, note, completed_at`,
      [
        followupId,
        userId,
        input.status ?? null,
        input.note ?? null,
        input.dueAt ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      response.status(404).json({ error: "Follow-up not found" });
      return;
    }

    broadcast("followup.updated", { followupId, status: row.status }, userId);
    await query(
      `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
       VALUES ('followup.updated', 'followup', $1, $2)`,
      [followupId, JSON.stringify({ status: row.status })],
    );

    response.json({ followup: row });
  } catch (error) {
    next(error);
  }
});

export const applicationFollowupsRouter = Router();

applicationFollowupsRouter.post("/:id/followups", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const applicationId = z.string().uuid().parse(request.params.id);
    const input = createSchema.parse(request.body);

    const owned = await query(
      "SELECT id FROM applications WHERE id = $1 AND user_id = $2",
      [applicationId, userId],
    );
    if (!owned.rows[0]) {
      response.status(404).json({ error: "Application not found" });
      return;
    }

    const result = await query(
      `INSERT INTO followups (application_id, user_id, due_at, status, channel, note)
       VALUES ($1, $2, $3, 'PENDING', $4, $5)
       ON CONFLICT (application_id, due_at) DO UPDATE SET note = EXCLUDED.note
       RETURNING id, application_id, due_at, status, channel, note, created_at`,
      [applicationId, userId, input.dueAt, input.channel, input.note],
    );

    broadcast("followup.created", { followupId: result.rows[0]?.id }, userId);
    await notify(userId, {
      type: "followup",
      title: "Follow-up scheduled",
      body: `We will remind you on ${new Date(input.dueAt).toDateString()}.`,
    });

    response.status(201).json({ followup: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
