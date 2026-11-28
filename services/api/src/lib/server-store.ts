/**
 * Persistent production server state: SQLite for indexed state, JSONL for the
 * append-only record.
 *
 * Vercel Functions get an ephemeral filesystem, so the serverless adapter keeps
 * Redis/Neon. A long-running production backend uses this store as its cache,
 * automation registry, tick lease table and queue substrate — no Redis process
 * required.
 *
 * `SERVER_STATE_BACKEND` accepts:
 *   - redis          keep Redis/BullMQ (also forced on Vercel)
 *   - jsonl          append-only log only
 *   - sqlite         indexed store only
 *   - sqlite+jsonl   both, recommended default for a production server
 */

import {
  appendJsonlEvent,
  jsonlTickStoreEnabled,
  loadJsonlDispatches,
} from "./server-jsonl-store.js";
import {
  claimSqliteTick,
  loadSqliteDispatches,
  releaseSqliteTick,
  recordSqliteDispatch,
  sqliteDatabase,
  sqliteTickStoreEnabled,
} from "./server-sqlite-store.js";

export type ServerStoreBackend = "redis" | "jsonl" | "sqlite" | "sqlite+jsonl";

export function serverStoreBackend(): ServerStoreBackend {
  if (process.env.VERCEL === "1") return "redis";
  const configured = process.env.SERVER_STATE_BACKEND;
  if (configured === "jsonl" || configured === "sqlite" || configured === "sqlite+jsonl") {
    return configured;
  }
  return "sqlite+jsonl";
}

export function usesServerStore(): boolean {
  return serverStoreBackend() !== "redis";
}

function sqliteEnabled(): boolean {
  const backend = serverStoreBackend();
  return backend === "sqlite" || backend === "sqlite+jsonl" || sqliteTickStoreEnabled();
}

function jsonlEnabled(): boolean {
  const backend = serverStoreBackend();
  return backend === "jsonl" || backend === "sqlite+jsonl" || jsonlTickStoreEnabled();
}

async function log(
  type: "enqueue" | "ack" | "fail" | "cache" | "automation",
  name: string,
  payload?: unknown,
): Promise<void> {
  if (jsonlEnabled()) {
    await appendJsonlEvent({ at: Date.now(), type, name, payload });
  }
}

export async function claimServerTick(
  name: string,
  ttlSeconds: number,
  token: string,
): Promise<boolean> {
  if (sqliteEnabled()) return claimSqliteTick(name, ttlSeconds, token);
  if (jsonlEnabled()) {
    const { claimJsonlTick } = await import("./server-jsonl-store.js");
    return claimJsonlTick(name, ttlSeconds, token);
  }
  return false;
}

export async function releaseServerTick(name: string, token: string): Promise<void> {
  if (sqliteEnabled()) await releaseSqliteTick(name, token);
  else if (jsonlEnabled()) {
    const { releaseJsonlTick } = await import("./server-jsonl-store.js");
    await releaseJsonlTick(name, token);
  }
}

export async function recordServerDispatch(name: string, boundary: number): Promise<void> {
  if (sqliteEnabled()) await recordSqliteDispatch(name, boundary);
  if (jsonlEnabled()) {
    const { recordJsonlDispatch } = await import("./server-jsonl-store.js");
    await recordJsonlDispatch(name, boundary);
  }
}

export function loadServerDispatches(): Map<string, number> {
  if (sqliteEnabled()) return loadSqliteDispatches();
  if (jsonlEnabled()) return loadJsonlDispatches();
  return new Map();
}

export async function serverCacheGet<T>(key: string): Promise<T | null> {
  if (!sqliteEnabled()) return null;
  const now = Date.now();
  const row = sqliteDatabase()
    .prepare("SELECT value, expires_at FROM server_cache WHERE key = ?")
    .get(key) as { value: string; expires_at: number | null } | undefined;
  if (!row) return null;
  if (row.expires_at !== null && row.expires_at <= now) return null;
  return JSON.parse(row.value) as T;
}

export async function serverCacheSet(
  key: string,
  value: unknown,
  ttlMs?: number,
): Promise<void> {
  if (!sqliteEnabled()) return;
  const now = Date.now();
  sqliteDatabase()
    .prepare(
      `INSERT INTO server_cache (key, value, expires_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      key,
      JSON.stringify(value ?? null),
      ttlMs ? now + ttlMs : null,
      now,
    );
  await log("cache", key);
}

export async function serverCacheDelByPrefix(prefix: string): Promise<void> {
  if (!sqliteEnabled()) return;
  sqliteDatabase()
    .prepare("DELETE FROM server_cache WHERE key LIKE ?")
    .run(`${prefix}%`);
}

export interface ServerAutomation {
  key: string;
  name: string;
  topic: string;
  payload: unknown;
  intervalMs: number;
}

export async function registerServerAutomation(
  automation: ServerAutomation,
): Promise<void> {
  if (!sqliteEnabled()) return;
  const now = Date.now();
  sqliteDatabase()
    .prepare(
      `INSERT INTO automations
         (key, name, topic, payload, interval_ms, enabled, next_run_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         name = excluded.name,
         topic = excluded.topic,
         payload = excluded.payload,
         interval_ms = excluded.interval_ms,
         enabled = 1`,
    )
    .run(
      automation.key,
      automation.name,
      automation.topic,
      JSON.stringify(automation.payload ?? {}),
      automation.intervalMs,
      now + automation.intervalMs,
      now,
    );
  await log("automation", automation.key, automation);
}

export async function dueServerAutomations(): Promise<ServerAutomation[]> {
  if (!sqliteEnabled()) return [];
  const now = Date.now();
  const rows = sqliteDatabase()
    .prepare(
      `SELECT key, name, topic, payload, interval_ms
         FROM automations
        WHERE enabled = 1 AND next_run_at <= ?
        ORDER BY next_run_at ASC`,
    )
    .all(now) as Array<{
    key: string;
    name: string;
    topic: string;
    payload: string;
    interval_ms: number;
  }>;
  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    topic: row.topic,
    payload: JSON.parse(row.payload) as unknown,
    intervalMs: row.interval_ms,
  }));
}

export async function advanceServerAutomation(key: string): Promise<void> {
  if (!sqliteEnabled()) return;
  const now = Date.now();
  sqliteDatabase()
    .prepare(
      `UPDATE automations
          SET last_run_at = ?, next_run_at = ? + interval_ms
        WHERE key = ? AND enabled = 1`,
    )
    .run(now, now, key);
}

export { appendJsonlEvent };
