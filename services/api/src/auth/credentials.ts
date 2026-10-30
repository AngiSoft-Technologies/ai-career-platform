import { randomUUID } from "node:crypto";
import { query } from "../db/pool.js";
import { AuthProviderError } from "./providers/errors.js";
import { ensureLocalUserRecord } from "./neon-auth.js";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "./passwords.js";

/**
 * Password credentials owned by the API.
 *
 * The API stores and verifies the hash itself. Nothing about the credential
 * leaves this process, and no provider is involved in a password sign-in.
 */

interface CredentialRow {
  user_id: string;
  password_hash: string;
  password_salt: string;
}

export async function findCredentialByEmail(
  email: string,
): Promise<(CredentialRow & { id: string; email: string; display_name: string }) | null> {
  const result = await query<CredentialRow & {
    id: string;
    email: string;
    display_name: string;
  }>(
    `SELECT c.user_id, c.password_hash, c.password_salt,
            u.id, u.email, u.display_name
       FROM auth_password_credentials c
       JOIN public.users u ON u.id = c.user_id
      WHERE lower(u.email) = lower($1)`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function findCredentialByUserId(
  userId: string,
): Promise<CredentialRow | null> {
  const result = await query<CredentialRow>(
    `SELECT user_id, password_hash, password_salt
       FROM auth_password_credentials
      WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function storeCredential(
  userId: string,
  password: string,
): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  await query(
    `INSERT INTO auth_password_credentials
       (user_id, password_hash, password_salt)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           password_salt = EXCLUDED.password_salt,
           updated_at = now()`,
    [userId, hash, salt],
  );
}

async function recordPasswordIdentity(userId: string, email: string): Promise<void> {
  await query(
    `INSERT INTO auth_identities (user_id, provider, provider_subject, email)
     VALUES ($1::uuid, 'password', $1::text, $2)
     ON CONFLICT (provider, provider_subject)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   email = EXCLUDED.email,
                   last_used_at = now()`,
    [userId, email],
  );
}

/**
 * Creates an account with a password.
 *
 * When the email already belongs to an account that has no password yet (for
 * example one that was created with Google), the password is attached to that
 * account instead of creating a duplicate.
 */
export async function createPasswordAccount(input: {
  email: string;
  password: string;
  name: string;
}): Promise<string> {
  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) {
    throw new AuthProviderError(
      policy.reason ?? "Password is too weak",
      "WEAK_PASSWORD",
      400,
    );
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM public.users WHERE lower(email) = lower($1) LIMIT 1`,
    [input.email],
  );
  const existingUserId = existing.rows[0]?.id;

  if (existingUserId) {
    const credential = await findCredentialByUserId(existingUserId);
    if (credential) {
      throw new AuthProviderError(
        "That email address is already registered",
        "EMAIL_IN_USE",
        409,
      );
    }
    await storeCredential(existingUserId, input.password);
    await recordPasswordIdentity(existingUserId, input.email);
    return existingUserId;
  }

  const userId = await ensureLocalUserRecord({
    userId: randomUUID(),
    email: input.email,
    name: input.name,
    neonRole: null,
  });

  await storeCredential(userId, input.password);
  await recordPasswordIdentity(userId, input.email);
  return userId;
}

/**
 * Verifies a password and returns the account it belongs to.
 *
 * A wrong email and a wrong password produce the same error and take a
 * comparable amount of time.
 */
export async function authenticatePassword(input: {
  email: string;
  password: string;
}): Promise<string> {
  const credential = await findCredentialByEmail(input.email);

  const valid = await verifyPassword(
    input.password,
    credential
      ? { hash: credential.password_hash, salt: credential.password_salt }
      : null,
  );

  if (!credential || !valid) {
    throw new AuthProviderError(
      "Email or password is incorrect",
      "INVALID_CREDENTIALS",
      401,
    );
  }

  await recordPasswordIdentity(credential.user_id, credential.email);
  await query(
    `UPDATE auth_identities
        SET last_used_at = now()
      WHERE provider = 'password' AND provider_subject = $1`,
    [credential.user_id],
  );

  return credential.user_id;
}
