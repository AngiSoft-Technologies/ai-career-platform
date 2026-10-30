import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";
import { checkPasswordPolicy, hashPassword } from "./passwords.js";
import { AuthProviderError } from "./providers/errors.js";
import { sendPasswordResetEmail } from "../services/email.js";

/**
 * Password reset, owned by the API.
 *
 * The token is generated here, emailed to the account owner and stored only as
 * a hash. Presenting it once sets a new password and burns the token.
 */

const RESET_TTL_SECONDS = 60 * 60; // one hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resetBaseUrl(): string {
  return (config.INVITE_BASE_URL ?? config.WEB_ORIGINS[0] ?? "").replace(
    /\/$/,
    "",
  );
}

/**
 * Starts a password reset.
 *
 * The caller must not be able to tell whether the address exists, so this
 * always reports success.
 */
export async function requestPasswordReset(input: {
  email: string;
  redirectTo?: string;
}): Promise<void> {
  const result = await query<{ id: string; email: string; display_name: string }>(
    `SELECT id, email, display_name
       FROM public.users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [input.email],
  );
  const user = result.rows[0];
  if (!user) return;

  const token = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO auth_password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
    [user.id, hashToken(token), String(RESET_TTL_SECONDS)],
  );

  const base = input.redirectTo ?? `${resetBaseUrl()}/reset-password`;
  const separator = base.includes("?") ? "&" : "?";
  const link = `${base}${separator}token=${encodeURIComponent(token)}`;

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.display_name,
      resetUrl: link,
    });
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "Password reset email could not be sent",
    );
  }
}

/**
 * Completes a password reset.
 */
export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<string> {
  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) {
    throw new AuthProviderError(
      policy.reason ?? "Password is too weak",
      "WEAK_PASSWORD",
      400,
    );
  }

  const result = await query<{ user_id: string }>(
    `UPDATE auth_password_reset_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id`,
    [hashToken(input.token)],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthProviderError(
      "That reset link has expired. Please request a new one.",
      "TOKEN_INVALID",
      400,
    );
  }

  const { hash, salt } = await hashPassword(input.password);
  await query(
    `INSERT INTO auth_password_credentials
       (user_id, password_hash, password_salt)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           password_salt = EXCLUDED.password_salt,
           updated_at = now()`,
    [row.user_id, hash, salt],
  );

  await query(
    `INSERT INTO auth_identities (user_id, provider, provider_subject, email)
     SELECT $1::uuid, 'password', $1::text, email FROM public.users WHERE id = $1::uuid
     ON CONFLICT (provider, provider_subject)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   email = EXCLUDED.email,
                   last_used_at = now()`,
    [row.user_id],
  );

  return row.user_id;
}
