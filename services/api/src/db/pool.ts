import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
});

pool.on("error", (error) => {
  console.error("Unexpected Postgres pool error", error);
});

const TRANSIENT_CODES = new Set([
  "08000",
  "08003",
  "08006",
  "08001",
  "08004",
  "57P01",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
]);

function isTransient(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("Connection terminated") ||
    message.includes("timeout exceeded") ||
    message.includes("ECONNRESET")
  );
}

/**
 * Runs a statement, retrying once when Neon drops an idle pooled connection.
 * Without the retry a long ingestion run fails on the first stale socket.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
  attempts = 2,
): Promise<pg.QueryResult<T>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await pool.query<T>(text, values);
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw lastError;
}

export async function healthCheck(): Promise<boolean> {
  const result = await query<{ ok: number }>("select 1 as ok");
  return result.rows[0]?.ok === 1;
}

/**
 * Opens the pool and verifies the database is reachable before any background
 * job runs. Without this, jobs scheduled at boot can fail against a cold Neon
 * connection and look like application bugs.
 */
export async function warmPool(attempts = 5): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await query<{ ok: number }>("select 1 as ok");
      if (result.rows[0]?.ok === 1) return true;
    } catch (error) {
      if (attempt === attempts) {
        console.error(
          "Database pool warmup failed",
          error instanceof Error ? error.message : error,
        );
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  return false;
}
