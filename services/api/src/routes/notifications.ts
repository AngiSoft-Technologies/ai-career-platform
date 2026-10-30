import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";

export const notificationsRouter = Router();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().datetime().optional(),
});

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: Date | null;
  created_at: Date;
}

function serialize(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: row.read_at !== null,
    createdAt: row.created_at,
  };
}

notificationsRouter.get("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const { limit, before } = listSchema.parse(request.query);

    const [items, unread] = await Promise.all([
      query<NotificationRow>(
        `SELECT id, type, title, body, read_at, created_at
           FROM notifications
          WHERE user_id = $1
            AND ($2::timestamptz IS NULL OR created_at < $2)
          ORDER BY created_at DESC
          LIMIT $3`,
        [userId, before ?? null, limit],
      ),
      query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM notifications
          WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      ),
    ]);

    response.setHeader("Cache-Control", "no-store");
    response.json({
      items: items.rows.map(serialize),
      unreadCount: Number(unread.rows[0]?.count ?? 0),
      nextCursor:
        items.rows.length === limit
          ? items.rows[items.rows.length - 1]?.created_at ?? null
          : null,
    });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.get("/unread-count", async (_request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const result = await query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM notifications
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    response.setHeader("Cache-Control", "no-store");
    response.json({ unreadCount: Number(result.rows[0]?.count ?? 0) });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post("/read", async (_request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const result = await query(
      `UPDATE notifications
          SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    response.json({ updated: result.rowCount ?? 0, unreadCount: 0 });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch("/:id/read", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const id = z.string().uuid().parse(request.params.id);
    const result = await query(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [id, userId],
    );
    if (result.rowCount === 0) {
      response.status(404).json({ error: "Notification not found" });
      return;
    }
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
