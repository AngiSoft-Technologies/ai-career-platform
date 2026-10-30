import { query } from "../db/pool.js";
import { createPasswordAccount } from "./credentials.js";
import { hashPassword } from "./passwords.js";

/**
 * Administrative account operations.
 *
 * The API owns the account store, so there is no provider admin API to call.
 * Every operation here writes to the same database the sign-in path reads.
 */

export class AuthAdminError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AuthAdminError";
  }
}

export async function adminCreateUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ id: string; email: string; name: string }> {
  try {
    const id = await createPasswordAccount({
      email: input.email,
      password: input.password,
      name: input.name,
    });
    return { id, email: input.email, name: input.name };
  } catch (error) {
    if (error instanceof AuthAdminError) throw error;
    throw new AuthAdminError(
      "The account could not be created",
      "AUTH_ADMIN_CREATE_FAILED",
    );
  }
}

export async function adminSetUserPassword(input: {
  userId: string;
  newPassword: string;
}): Promise<void> {
  const { hash, salt } = await hashPassword(input.newPassword);
  const result = await query(
    `INSERT INTO auth_password_credentials
       (user_id, password_hash, password_salt)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           password_salt = EXCLUDED.password_salt,
           updated_at = now()
     RETURNING user_id`,
    [input.userId, hash, salt],
  );
  if (result.rowCount === 0) {
    throw new AuthAdminError(
      "The account could not be found",
      "AUTH_ADMIN_USER_NOT_FOUND",
      404,
    );
  }
}

export async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const result = await query<{ id: string; email: string; name: string }>(
    `SELECT id, email, display_name AS name
       FROM public.users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [email],
  );
  return result.rows[0] ?? null;
}

/**
 * Password resets are handled by the API.
 *
 * This entry point only exists for the invitation email fallback, which can
 * no longer reach a provider mailer. It reports that no message was sent so
 * the caller can surface the invitation link instead.
 */
export async function requestPasswordReset(input: {
  email: string;
  redirectTo: string;
}): Promise<boolean> {
  void input;
  return false;
}
