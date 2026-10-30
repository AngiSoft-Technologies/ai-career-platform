import { randomUUID } from "node:crypto";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";
import { ensureLocalUserRecord } from "./neon-auth.js";
import { AuthProviderError } from "./providers/errors.js";
import type { GoogleIdentity } from "./providers/google.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

async function upsertIdentity(input: {
  userId: string;
  provider: string;
  subject: string;
  email: string;
}): Promise<void> {
  await query(
    `INSERT INTO auth_identities (user_id, provider, provider_subject, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_subject)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       email = EXCLUDED.email,
       last_used_at = now()`,
    [input.userId, input.provider, input.subject, input.email],
  );
}

/**
 * Google identity: the backend verified the ID token, so the subject is the
 * Google `sub`. If the same verified email already exists locally, the identity
 * is linked to that account instead of creating a duplicate.
 */
export async function resolveGoogleUser(
  identity: GoogleIdentity,
): Promise<string> {
  const existing = await query<{ user_id: string }>(
    `SELECT user_id FROM auth_identities
      WHERE provider = 'google' AND provider_subject = $1`,
    [identity.subject],
  );
  const linked = existing.rows[0];
  if (linked) {
    await query(
      `UPDATE auth_identities SET last_used_at = now() WHERE provider = 'google' AND provider_subject = $1`,
      [identity.subject],
    );
    return linked.user_id;
  }

  const byEmail = await query<{ id: string }>(
    `SELECT id FROM public.users
      WHERE lower(email) = lower($1)
      ORDER BY created_at ASC
      LIMIT 1`,
    [identity.email],
  );

  const userId =
    byEmail.rows[0]?.id ??
    (await ensureLocalUserRecord({
      userId: randomUUID(),
      email: identity.email,
      name: identity.name,
      neonRole: null,
    }));

  await upsertIdentity({
    userId,
    provider: "google",
    subject: identity.subject,
    email: identity.email,
  });

  return userId;
}

/**
 * Links a verified Google identity to an existing account.
 *
 * The provider identity is never moved to another account: if it is already
 * linked elsewhere the link is refused so two accounts can never share one
 * provider identity.
 */
export async function linkGoogleIdentity(
  userId: string,
  identity: GoogleIdentity,
): Promise<void> {
  const existing = await query<{ user_id: string }>(
    `SELECT user_id FROM auth_identities
      WHERE provider = 'google' AND provider_subject = $1`,
    [identity.subject],
  );
  const linked = existing.rows[0];
  if (linked && linked.user_id !== userId) {
    throw new AuthProviderError(
      "That Google account is already connected to another Job Radar account",
      "IDENTITY_ALREADY_LINKED",
      409,
    );
  }

  await upsertIdentity({
    userId,
    provider: "google",
    subject: identity.subject,
    email: identity.email,
  });
}

export async function getAuthUser(userId: string): Promise<AuthUser | null> {
  const result = await query<{ id: string; email: string; name: string }>(
    `SELECT id, email, display_name AS name FROM public.users WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function recordAuthEvent(input: {
  userId?: string | null;
  action: string;
  outcome: "success" | "failure";
  code?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'auth', $1, $3)`,
      [
        input.userId ?? null,
        input.action,
        JSON.stringify({
          outcome: input.outcome,
          code: input.code ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        }),
      ],
    );
  } catch (error) {
    // Auditing must never break authentication.
    logger.warn(
      {
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to record auth audit event",
    );
  }
}
