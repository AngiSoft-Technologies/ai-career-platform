/**
 * SQLite-backed pub/sub for the persistent production backend.
 *
 * This is the file-backed counterpart to Redis pub/sub. Producers append one
 * event row; every subscriber keeps its own offset, so multiple server
 * replicas each receive the same message. Vercel keeps Redis pub/sub because
 * its filesystem is ephemeral.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import { sqliteDatabase, sqliteTickStoreEnabled } from "./server-sqlite-store.js";
import { serverStoreBackend } from "./server-store.js";

export interface ServerEvent<T = unknown> {
  id: number;
  topic: string;
  payload: T;
  createdAt: number;
}

export interface ServerEventSubscriberHandle {
  stop: () => Promise<void>;
}

function busEnabled(): boolean {
  const backend = serverStoreBackend();
  return backend === "sqlite" || backend === "sqlite+jsonl" || sqliteTickStoreEnabled();
}

let publishCount = 0;

export async function publishServerEvent(
  topic: string,
  payload: unknown,
): Promise<number | null> {
  if (!busEnabled()) return null;
  const now = Date.now();
  const store = sqliteDatabase();
  // Realtime events are a short-lived transport, not an audit log. Keep the
  // table bounded without adding another cron: every 200th publish prunes
  // anything older than an hour.
  publishCount += 1;
  if (publishCount % 200 === 0) {
    store
      .prepare("DELETE FROM server_events WHERE created_at < ?")
      .run(now - 60 * 60_000);
  }
  const result = store
    .prepare(
      `INSERT INTO server_events (topic, payload, created_at)
       VALUES (?, ?, ?)`,
    )
    .run(topic, JSON.stringify(payload ?? {}), now);
  return Number(result.lastInsertRowid);
}

/**
 * Polls a topic from the caller's own offset. The loop is re-armed by a timer,
 * so a slow handler cannot stack overlapping reads.
 */
export function subscribeServerEvents<T = unknown>(
  topic: string,
  handler: (event: ServerEvent<T>) => void | Promise<void>,
  options: { pollMs?: number; batchSize?: number; consumerId?: string } = {},
): ServerEventSubscriberHandle {
  const pollMs = Math.min(Math.max(Math.trunc(options.pollMs ?? 250), 50), 5_000);
  const batchSize = Math.min(Math.max(Math.trunc(options.batchSize ?? 50), 1), 500);
  const consumerId = options.consumerId ?? `${process.pid}:${randomUUID().slice(0, 8)}`;
  const offsetKey = `${topic}:${consumerId}`;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let ready = false;

  const poll = async (): Promise<void> => {
    if (stopped || !busEnabled()) return;
    try {
      const store = sqliteDatabase();
      if (!ready) {
        // A fresh subscriber starts at the current tail, not at event 1.
        // Otherwise every restart would replay old broadcasts to live sockets.
        const existing = store
          .prepare("SELECT last_id FROM server_event_offsets WHERE key = ?")
          .get(offsetKey) as { last_id: number } | undefined;
        if (!existing) {
          const tail = store
            .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM server_events WHERE topic = ?")
            .get(topic) as { id: number };
          store
            .prepare(
              `INSERT INTO server_event_offsets (key, last_id, updated_at)
               VALUES (?, ?, ?)`,
            )
            .run(offsetKey, tail.id, Date.now());
        }
        ready = true;
      }
      const offset = store
        .prepare("SELECT last_id FROM server_event_offsets WHERE key = ?")
        .get(offsetKey) as { last_id: number } | undefined;
      const rows = store
        .prepare(
          `SELECT id, topic, payload, created_at
             FROM server_events
            WHERE topic = ? AND id > ?
            ORDER BY id ASC
            LIMIT ?`,
        )
        .all(topic, offset?.last_id ?? 0, batchSize) as Array<{
        id: number;
        topic: string;
        payload: string;
        created_at: number;
      }>;

      for (const row of rows) {
        try {
          await handler({
            id: row.id,
            topic: row.topic,
            payload: JSON.parse(row.payload) as T,
            createdAt: row.created_at,
          });
        } catch (error) {
          logger.debug(
            { eventId: row.id, error: error instanceof Error ? error.message : String(error) },
            "Server event handler failed",
          );
        }
        store
          .prepare(
            `INSERT INTO server_event_offsets (key, last_id, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET last_id = excluded.last_id, updated_at = excluded.updated_at`,
          )
          .run(offsetKey, row.id, Date.now());
      }
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        "Server event poll failed",
      );
    } finally {
      if (!stopped) {
        timer = setTimeout(() => void poll(), pollMs);
        timer.unref?.();
      }
    }
  };

  void poll();
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
