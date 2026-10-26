import { Router } from "express";
import { query } from "../db/pool.js";

export const streamRouter = Router();

streamRouter.get("/notifications", async (request, response) => {
  const userId = response.locals.userId as string;

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  const send = (event: string, data: unknown) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send("connected", { userId, at: new Date().toISOString() });
  let lastSeenId = "0";

  const poll = async () => {
    try {
      const result = await query(
        `SELECT id, type, aggregate_type, aggregate_id, payload, occurred_at
           FROM events
          WHERE id > $2::bigint
            AND (
              (aggregate_type = 'user' AND aggregate_id = $1)
              OR (aggregate_type = 'application' AND EXISTS (
                SELECT 1 FROM applications a
                 WHERE a.id::text = events.aggregate_id AND a.user_id = $1
              ))
              OR (aggregate_type = 'followup' AND EXISTS (
                SELECT 1 FROM followups f
                 WHERE f.id::text = events.aggregate_id AND f.user_id = $1
              ))
            )
          ORDER BY id ASC LIMIT 25`,
        [userId, lastSeenId],
      );
      if (result.rows.length > 0) {
        lastSeenId = String(result.rows[result.rows.length - 1]?.id ?? lastSeenId);
      }
      if (result.rows.length < 25) {
        const latest = await query<{ latest_id: string }>(
          "SELECT COALESCE(max(id), 0)::text AS latest_id FROM events",
        );
        lastSeenId = latest.rows[0]?.latest_id ?? lastSeenId;
      }
      if (result.rows.length > 0) send("events", {
        items: result.rows.map((row) => ({
          id: row.id,
          type: row.type,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          payload: row.payload,
          occurredAt: row.occurred_at,
        })),
      });
    } catch {
      send("error", { message: "stream query failed" });
    }
  };

  await poll();
  const timer = setInterval(() => void poll(), 15_000);
  const heartbeat = setInterval(() => response.write(": keepalive\n\n"), 20_000);

  request.on("close", () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    response.end();
  });
});
