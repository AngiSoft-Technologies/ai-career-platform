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

  const poll = async () => {
    try {
      const result = await query(
        `SELECT id, type, aggregate_type, aggregate_id, payload, occurred_at
           FROM events
          WHERE occurred_at > now() - interval '10 minutes'
          ORDER BY id DESC LIMIT 25`,
      );
      send("events", {
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
