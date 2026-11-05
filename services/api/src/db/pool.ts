import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

/**
 * Every statement is bounded.
 *
 * Without a statement timeout a single blocked query waits forever: the
 * server-side default is zero, which means "no limit". In a worker that is
 * fatal rather than merely slow — the job holds its concurrency slot for
 * ever, the queue stops draining, and nothing reports an error. The same
 * is true of a lock wait, which is the common case when two jobs touch the
 * same row: `lock_timeout` turns that wait into an error the retry logic
 * can handle.
 *
 * `query_timeout` is the client-side backstop for a socket that dies
 * without the server noticing.
 */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
  lock_timeout: config.DB_LOCK_TIMEOUT_MS,
  query_timeout: config.DB_QUERY_TIMEOUT_MS,
  idle_in_transaction_session_timeout: config.DB_IDLE_IN_TRANSACTION_MS,
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
 * Runs a unit of work in one transaction.
 *
 * The pool helper (`query`) runs every statement in its own transaction,
 * which is fine for a statement that stands alone and wrong for a unit
 * of work that has to be atomic: "read these rows, then write them" is
 * two transactions, and another worker can read the same rows in
 * between.
 *
 * That is not a theoretical race. The promotion step reads the verified
 * candidates and then inserts the opportunities, and the ingestion tick
 * and the internal route both run it — so two promotions could read the
 * same candidate and both create an opportunity for it. The catalogue
 * held 604 such pairs.
 *
 * The transaction is the unit of atomicity; `FOR UPDATE SKIP LOCKED`
 * inside it is what keeps two workers off the same rows.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // The rollback is best-effort: if the connection is already gone the
    // transaction is gone with it, and the original error is the one
    // worth reporting.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
