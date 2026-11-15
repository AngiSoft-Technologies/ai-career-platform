import { createHash, randomBytes } from "node:crypto";
import { query } from "../db/pool.js";

/**
 * One-time codes that carry a finished sign-in back to the browser.
 *
 * The social sign-in runs on the API's domain, so the API finishes it and
 * then has to hand the result to the app on the app's domain. Handing over
 * the tokens themselves worked, but it put a thirty-day refresh token in the
 * URL — a place the user can be tricked into copying, and a place browser
 * history keeps.
 *
 * A handoff code carries no privilege: it is a random value that names the
 * account the session belongs to. The client exchanges it for tokens at
 * `POST /v1/auth/exchange`, and the exchange is what mints them.
 *
 * The rules that make it safe:
 *
 *   * single use    — claimed with DELETE ... RETURNING, so the second
 *                     redemption of the same code finds no row;
 *   * short lived   — two minutes covers a redirect and one request;
 *   * stored hashed — the table holds a digest, never the code itself.
 */

const HANDOFF_TTL_SECONDS = 120;

export function hashHandoffCode(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mints a code for `userId` and returns it in the clear, exactly once. */
export async function createHandoffCode(
  userId: string,
  provider = "google",
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO auth_handoff_codes (code_hash, user_id, provider, expires_at)
      VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
    [hashHandoffCode(code), userId, provider, String(HANDOFF_TTL_SECONDS)],
  );
  return code;
}

export interface HandoffClaim {
  userId: string;
  provider: string;
}

/**
 * Redeems a code.
 *
 * The row is deleted by the claim itself, which is what makes the code
 * single use: two concurrent redemptions race for the same row and exactly
 * one of them gets it.
 */
export async function claimHandoffCode(code: string): Promise<HandoffClaim | null> {
  const result = await query<{ user_id: string; provider: string }>(
    `DELETE FROM auth_handoff_codes
      WHERE code_hash = $1
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING user_id, provider`,
    [hashHandoffCode(code)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { userId: row.user_id, provider: row.provider };
}
