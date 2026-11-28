/**
 * SQLite store for the persistent production backend.
 *
 * This is our file-backed Redis equivalent: indexed leases, cache, automations,
 * jobs and events. Vercel Functions have an ephemeral filesystem, so the
 * serverless adapter keeps using Neon/Redis. A production server gets durable
 * state here without requiring a Redis process.
 */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

// esbuild does not recognise `node:sqlite` as a builtin and rewrites a static
// import into the non-existent `sqlite` package. Loading it through require
// keeps the runtime import intact while the type above stays fully checked.
const requireBuiltin = createRequire(import.meta.url);

function openDatabase(path: string): DatabaseSyncType {
  const { DatabaseSync } = requireBuiltin("node:sqlite") as typeof import("node:sqlite");
  return new DatabaseSync(path);
}

let database: DatabaseSyncType | null = null;

function sqlitePath(): string {
  return resolve(process.env.SERVER_SQLITE_FILE ?? ".data/server.sqlite");
}

function ensureColumn(
  store: DatabaseSyncType,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = store.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!columns.some((entry) => entry.name === column)) {
    store.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function sqliteDatabase(): DatabaseSyncType {
  if (database) return database;
  const path = sqlitePath();
  mkdirSync(dirname(path), { recursive: true });
  const store = openDatabase(path);
  store.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS server_tick_leases (
      name TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_tick_dispatches (
      name TEXT PRIMARY KEY,
      boundary INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_tick_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      token TEXT,
      expires_at INTEGER,
      boundary INTEGER,
      payload TEXT
    );

    CREATE TABLE IF NOT EXISTS server_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      priority INTEGER NOT NULL DEFAULT 0,
      run_at INTEGER NOT NULL,
      locked_until INTEGER,
      locked_by TEXT,
      dedupe_key TEXT UNIQUE,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS server_jobs_due
      ON server_jobs (status, run_at, priority, locked_until);
    CREATE INDEX IF NOT EXISTS server_jobs_topic
      ON server_jobs (topic, status, run_at);

    CREATE TABLE IF NOT EXISTS server_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automations (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      interval_ms INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      next_run_at INTEGER NOT NULL,
      last_run_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS server_events_unconsumed
      ON server_events (topic, consumed_at, id);

    CREATE TABLE IF NOT EXISTS server_event_offsets (
      key TEXT PRIMARY KEY,
      last_id INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);

  // Upgrade files created by an earlier build without losing queued work.
  ensureColumn(store, "server_jobs", "priority", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(store, "server_jobs", "locked_by", "TEXT");
  ensureColumn(store, "server_jobs", "dedupe_key", "TEXT");
  ensureColumn(store, "server_jobs", "last_error", "TEXT");

  database = store;
  return store;
}

export function sqliteTickStoreEnabled(): boolean {
  return (
    (process.env.SERVER_STATE_BACKEND === "sqlite" ||
      process.env.SERVER_STATE_BACKEND === "sqlite+jsonl") &&
    process.env.VERCEL !== "1"
  );
}

export async function claimSqliteTick(
  name: string,
  ttlSeconds: number,
  token: string,
): Promise<boolean> {
  const store = sqliteDatabase();
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  store.exec("BEGIN IMMEDIATE");
  try {
    const current = store
      .prepare("SELECT token, expires_at FROM server_tick_leases WHERE name = ?")
      .get(name) as { token: string; expires_at: number } | undefined;
    if (current && current.expires_at > now) {
      store.exec("ROLLBACK");
      return false;
    }

    store
      .prepare(
        `INSERT INTO server_tick_leases (name, token, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at`,
      )
      .run(name, token, expiresAt);
    store
      .prepare(
        `INSERT INTO server_tick_events (at, type, name, token, expires_at)
         VALUES (?, 'claim', ?, ?, ?)`,
      )
      .run(now, name, token, expiresAt);
    store.exec("COMMIT");
    return true;
  } catch (error) {
    store.exec("ROLLBACK");
    throw error;
  }
}

export async function releaseSqliteTick(name: string, token: string): Promise<void> {
  const store = sqliteDatabase();
  const now = Date.now();
  store.exec("BEGIN IMMEDIATE");
  try {
    store
      .prepare("DELETE FROM server_tick_leases WHERE name = ? AND token = ?")
      .run(name, token);
    store
      .prepare(
        `INSERT INTO server_tick_events (at, type, name, token)
         VALUES (?, 'release', ?, ?)`,
      )
      .run(now, name, token);
    store.exec("COMMIT");
  } catch (error) {
    store.exec("ROLLBACK");
    throw error;
  }
}

export async function recordSqliteDispatch(name: string, boundary: number): Promise<void> {
  const store = sqliteDatabase();
  store
    .prepare(
      `INSERT INTO server_tick_dispatches (name, boundary)
       VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET boundary = excluded.boundary`,
    )
    .run(name, boundary);
  store
    .prepare(
      `INSERT INTO server_tick_events (at, type, name, boundary)
       VALUES (?, 'dispatch', ?, ?)`,
    )
    .run(Date.now(), name, boundary);
}

export function loadSqliteDispatches(): Map<string, number> {
  const rows = sqliteDatabase()
    .prepare("SELECT name, boundary FROM server_tick_dispatches")
    .all() as Array<{ name: string; boundary: number }>;
  return new Map(rows.map((row) => [row.name, row.boundary]));
}
