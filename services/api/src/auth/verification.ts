import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";
import { sendVerificationEmail } from "../services/email.js";
import { AuthProviderError } from "./providers/errors.js";
import { assertRedirectAllowed } from "./providers/google-oauth.js";
import { createHandoffCode } from "./handoff.js";
import { recordAuthEvent } from "./identities.js";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "./totp.js";

/**
 * Step-up verification.
 *
 * Sessions are long-lived now, so the API periodically asks the user to prove
 * one of their enrolled methods again. The methods are deliberately plural:
 * a TOTP authenticator app is the preferred default, an emailed magic link is
 * the fallback for accounts that have not enrolled one, and the same tables
 * leave room for OTP, passkeys and whatever comes next.
 */

const EMAIL_LINK_TTL_SECONDS = 15 * 60;
const MAX_PENDING_LINKS = 3;
const ISSUER = "MboQara";

export type VerificationMethodName =
  | "totp"
  | "email_link"
  | "email_otp"
  | "passkey"
  | "biometric";

export interface VerificationMethod {
  method: VerificationMethodName;
  destination: string;
  isDefault: boolean;
  enrolled: boolean;
  lastUsedAt?: string | null;
}

interface MethodRow {
  method: string;
  destination: string;
  is_default: boolean;
  confirmed_at: Date | null;
  last_used_at: Date | null;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Stamps the moment the user last proved they are still themselves. */
export async function markVerified(userId: string): Promise<void> {
  await query(
    `UPDATE users SET last_verified_at = now() WHERE id = $1`,
    [userId],
  );
}

export async function verificationState(userId: string): Promise<{
  verifiedAt: string | null;
  requiresVerification: boolean;
}> {
  const result = await query<{ last_verified_at: Date | null }>(
    `SELECT last_verified_at FROM users WHERE id = $1`,
    [userId],
  );
  const verifiedAt = result.rows[0]?.last_verified_at ?? null;
  const stale =
    !verifiedAt ||
    Date.now() - new Date(verifiedAt).getTime() >
      config.AUTH_STEP_UP_INTERVAL_SECONDS * 1000;
  return {
    verifiedAt: verifiedAt ? new Date(verifiedAt).toISOString() : null,
    requiresVerification: stale,
  };
}

async function confirmedMethods(userId: string): Promise<MethodRow[]> {
  const result = await query<MethodRow>(
    `SELECT method, destination, is_default, confirmed_at, last_used_at
       FROM user_verification_methods
      WHERE user_id = $1 AND confirmed_at IS NOT NULL
      ORDER BY is_default DESC, created_at ASC`,
    [userId],
  );
  return result.rows;
}

async function userEmail(userId: string): Promise<string | null> {
  const result = await query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0]?.email ?? null;
}

/**
 * The methods a user can verify with right now.
 *
 * Email is always available — every account has an address — while TOTP only
 * appears once enrolment has been confirmed. The default is the enrolled
 * method flagged `is_default`, falling back to email.
 */
export async function listVerificationMethods(
  userId: string,
): Promise<VerificationMethod[]> {
  const [rows, email] = await Promise.all([
    confirmedMethods(userId),
    userEmail(userId),
  ]);

  const methods: VerificationMethod[] = [];
  let hasDefault = false;

  for (const row of rows) {
    const isDefault = row.is_default && !hasDefault;
    if (isDefault) hasDefault = true;
    methods.push({
      method: row.method as VerificationMethodName,
      destination: row.destination,
      isDefault,
      enrolled: true,
      lastUsedAt: row.last_used_at
        ? new Date(row.last_used_at).toISOString()
        : null,
    });
  }

  if (email) {
    methods.push({
      method: "email_link",
      destination: email,
      isDefault: !hasDefault,
      enrolled: true,
    });
  }

  return methods;
}

// ---------------------------------------------------------------------------
// TOTP enrolment
// ---------------------------------------------------------------------------

export async function startTotpEnrollment(input: {
  userId: string;
  email: string;
}): Promise<{ secret: string; otpauthUrl: string }> {
  const secret = generateTotpSecret();
  await query(
    `INSERT INTO user_verification_methods
       (user_id, method, destination, secret_encrypted, is_default, confirmed_at)
     VALUES ($1, 'totp', 'authenticator', $2, false, NULL)
     ON CONFLICT (user_id, method, destination)
     DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted,
                   confirmed_at = NULL,
                   updated_at = now()`,
    [input.userId, encryptSecret(secret)],
  );
  return {
    secret,
    otpauthUrl: otpauthUrl({
      issuer: ISSUER,
      account: input.email,
      secret,
    }),
  };
}

export async function confirmTotpEnrollment(input: {
  userId: string;
  code: string;
}): Promise<VerificationMethod[]> {
  const result = await query<{ secret_encrypted: string }>(
    `SELECT secret_encrypted
       FROM user_verification_methods
      WHERE user_id = $1 AND method = 'totp' AND destination = 'authenticator'`,
    [input.userId],
  );
  const row = result.rows[0];
  const secret = row?.secret_encrypted ? decryptSecret(row.secret_encrypted) : null;
  if (!secret || !verifyTotp(secret, input.code)) {
    throw new AuthProviderError(
      "That code did not match. Check your authenticator app and try again.",
      "INVALID_CODE",
      401,
    );
  }

  await query(
    `UPDATE user_verification_methods SET is_default = false, updated_at = now()
      WHERE user_id = $1 AND is_default`,
    [input.userId],
  );
  await query(
    `UPDATE user_verification_methods
        SET confirmed_at = now(), is_default = true,
            last_used_at = now(), updated_at = now()
      WHERE user_id = $1 AND method = 'totp' AND destination = 'authenticator'`,
    [input.userId],
  );
  await markVerified(input.userId);
  await recordAuthEvent({
    userId: input.userId,
    action: "auth.verify.totp_enroll",
    outcome: "success",
  });
  return listVerificationMethods(input.userId);
}

async function totpSecret(userId: string): Promise<string | null> {
  const result = await query<{ secret_encrypted: string }>(
    `SELECT secret_encrypted
       FROM user_verification_methods
      WHERE user_id = $1 AND method = 'totp' AND destination = 'authenticator'
        AND confirmed_at IS NOT NULL`,
    [userId],
  );
  const row = result.rows[0];
  return row?.secret_encrypted ? decryptSecret(row.secret_encrypted) : null;
}

// ---------------------------------------------------------------------------
// Step-up requests
// ---------------------------------------------------------------------------

/**
 * Starts a verification.
 *
 * `totp` needs no server-side challenge — the code the user types *is* the
 * proof — so it returns immediately and the client collects the code. Every
 * other method creates a single-use challenge and delivers it.
 */
export async function requestVerification(input: {
  userId: string;
  method?: VerificationMethodName;
  redirectUri?: string;
  /** Picks which enrolled device a `biometric` challenge binds to. */
  deviceId?: string;
  meta?: { userAgent?: string | null; ip?: string | null };
}): Promise<{
  method: VerificationMethodName;
  requiresCode: boolean;
  sent: boolean;
  challengeId?: string;
}> {
  const methods = await listVerificationMethods(input.userId);
  const requested = input.method ?? methods.find((m) => m.isDefault)?.method;
  const chosen =
    requested === "biometric" && input.deviceId
      ? methods.find(
          (m) => m.method === "biometric" && m.destination === input.deviceId,
        )
      : methods.find((m) => m.method === requested);
  if (!chosen) {
    throw new AuthProviderError(
      "That verification method is not enrolled on this account.",
      "METHOD_NOT_AVAILABLE",
      400,
    );
  }

  if (chosen.method === "totp") {
    return { method: "totp", requiresCode: true, sent: true };
  }

  if (chosen.method === "biometric") {
    // The challenge is just a single-use id the device must sign with its
    // stored secret — proof = HMAC-SHA256(secret, challengeId).
    const challenge = await query<{ id: string }>(
      `INSERT INTO auth_verification_challenges
         (user_id, method, destination, redirect_uri, expires_at)
       VALUES ($1, 'biometric', $2, '', now() + interval '5 minutes')
       RETURNING id`,
      [input.userId, chosen.destination],
    );
    const challengeId = challenge.rows[0]?.id;
    if (!challengeId) {
      throw new AuthProviderError(
        "Could not start device verification. Try again.",
        "VERIFICATION_FAILED",
        500,
      );
    }
    await recordAuthEvent({
      userId: input.userId,
      action: "auth.verify.request",
      outcome: "success",
      code: "BIOMETRIC_CHALLENGE",
      ...input.meta,
    });
    return {
      method: "biometric",
      requiresCode: false,
      sent: true,
      challengeId,
    };
  }

  if (chosen.method !== "email_link") {
    throw new AuthProviderError(
      "That verification method is not available yet.",
      "METHOD_NOT_AVAILABLE",
      400,
    );
  }

  // Throttle link emails: a handful of pending links per window is plenty.
  const pending = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM auth_verification_challenges
      WHERE user_id = $1
        AND consumed_at IS NULL
        AND created_at > now() - interval '10 minutes'`,
    [input.userId],
  );
  if (Number(pending.rows[0]?.count ?? 0) >= MAX_PENDING_LINKS) {
    throw new AuthProviderError(
      "Too many verification links requested. Try again in a few minutes.",
      "VERIFICATION_RATE_LIMITED",
      429,
    );
  }

  const redirectUri = input.redirectUri ?? `${config.WEB_ORIGINS[0]}/auth/callback`;
  assertRedirectAllowed(redirectUri);

  const token = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO auth_verification_challenges
       (user_id, method, destination, token_hash, redirect_uri, expires_at)
     VALUES ($1, 'email_link', $2, $3, $4,
             now() + ($5 || ' seconds')::interval)`,
    [
      input.userId,
      chosen.destination,
      hashToken(token),
      redirectUri,
      String(EMAIL_LINK_TTL_SECONDS),
    ],
  );

  const verifyUrl = `${config.API_URL.replace(/\/$/, "")}/v1/auth/verification/magic?token=${encodeURIComponent(token)}`;
  const email = await userEmail(input.userId);
  let sent = false;
  if (email) {
    try {
      const result = await sendVerificationEmail({
        to: email,
        verifyUrl,
      });
      sent = result.sent;
      if (!result.sent) {
        logger.warn(
          { reason: result.reason },
          "Verification email was not delivered",
        );
      }
    } catch (error) {
      logger.error(
        { errorMessage: error instanceof Error ? error.message : String(error) },
        "Verification email failed",
      );
    }
  }

  await recordAuthEvent({
    userId: input.userId,
    action: "auth.verify.request",
    outcome: sent ? "success" : "failure",
    code: sent ? null : "EMAIL_UNAVAILABLE",
    ...input.meta,
  });

  return { method: "email_link", requiresCode: false, sent };
}

/** Verifies a TOTP code for step-up. */
export async function verifyTotpStepUp(input: {
  userId: string;
  code: string;
  meta?: { userAgent?: string | null; ip?: string | null };
}): Promise<void> {
  const secret = await totpSecret(input.userId);
  if (!secret || !verifyTotp(secret, input.code)) {
    await recordAuthEvent({
      userId: input.userId,
      action: "auth.verify.totp",
      outcome: "failure",
      code: "INVALID_CODE",
      ...input.meta,
    });
    throw new AuthProviderError(
      "That code did not match. Check your authenticator app and try again.",
      "INVALID_CODE",
      401,
    );
  }

  await query(
    `UPDATE user_verification_methods SET last_used_at = now(), updated_at = now()
      WHERE user_id = $1 AND method = 'totp' AND destination = 'authenticator'`,
    [input.userId],
  );
  await markVerified(input.userId);
  await recordAuthEvent({
    userId: input.userId,
    action: "auth.verify.totp",
    outcome: "success",
    ...input.meta,
  });
}

// ---------------------------------------------------------------------------
// Device biometrics (fingerprint / Face ID / whatever the device offers)
// ---------------------------------------------------------------------------

/**
 * Enrols this device as a verification method.
 *
 * The returned secret is shown exactly once: the client seals it in the
 * platform keystore and every later step-up proves possession by signing a
 * server-issued challenge with it. Biometrics gate *reading* that secret on
 * the device — the API only ever sees HMAC proofs, never the secret or a
 * biometric template.
 */
export async function enrollBiometricMethod(input: {
  userId: string;
  deviceId: string;
  meta?: { userAgent?: string | null; ip?: string | null };
}): Promise<{ deviceId: string; secret: string }> {
  const secret = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO user_verification_methods
       (user_id, method, destination, secret_encrypted, is_default,
        confirmed_at, last_used_at)
     VALUES ($1, 'biometric', $2, $3, false, now(), now())
     ON CONFLICT (user_id, method, destination)
     DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted,
                   confirmed_at = now(),
                   updated_at = now()`,
    [input.userId, input.deviceId, encryptSecret(secret)],
  );
  await recordAuthEvent({
    userId: input.userId,
    action: "auth.verify.biometric_enroll",
    outcome: "success",
    ...input.meta,
  });
  return { deviceId: input.deviceId, secret };
}

/**
 * Verifies a biometric step-up.
 *
 * `proof` must equal HMAC-SHA256(secret, challengeId) where `challengeId` is
 * the single-use id returned by `requestVerification`. A stolen bearer token
 * alone cannot pass this: the secret only exists inside the enrolled device's
 * keystore.
 */
export async function verifyBiometricStepUp(input: {
  userId: string;
  deviceId: string;
  challengeId: string;
  proof: string;
  meta?: { userAgent?: string | null; ip?: string | null };
}): Promise<void> {
  const fail = async (
    message: string,
    code = "INVALID_CODE",
    status = 401,
  ): Promise<never> => {
    await recordAuthEvent({
      userId: input.userId,
      action: "auth.verify.biometric",
      outcome: "failure",
      code,
      ...input.meta,
    });
    throw new AuthProviderError(message, code, status);
  };

  const challenge = await query<{
    id: string;
    destination: string;
    consumed_at: Date | null;
    expires_at: Date;
    attempts: number;
    max_attempts: number;
  }>(
    `SELECT id, destination, consumed_at, expires_at, attempts, max_attempts
       FROM auth_verification_challenges
      WHERE id = $1 AND user_id = $2 AND method = 'biometric'
        AND purpose = 'step_up'`,
    [input.challengeId, input.userId],
  );
  const row = challenge.rows[0];
  if (!row || row.destination !== input.deviceId) {
    return fail("That verification could not be completed. Request a new one.");
  }
  if (row.consumed_at) {
    await fail("That verification was already used. Request a new one.");
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await fail("That verification expired. Request a new one.");
  }
  if (row.attempts >= row.max_attempts) {
    await fail(
      "Too many attempts. Request a new verification.",
      "VERIFICATION_RATE_LIMITED",
      429,
    );
  }

  const method = await query<{ secret_encrypted: string }>(
    `SELECT secret_encrypted
       FROM user_verification_methods
      WHERE user_id = $1 AND method = 'biometric' AND destination = $2
        AND confirmed_at IS NOT NULL`,
    [input.userId, input.deviceId],
  );
  const encrypted = method.rows[0]?.secret_encrypted;
  const secret = encrypted ? decryptSecret(encrypted) : null;
  if (!secret) {
    return fail(
      "This device is not enrolled for verification.",
      "METHOD_NOT_AVAILABLE",
      400,
    );
  }

  const expected = createHmac("sha256", secret)
    .update(input.challengeId)
    .digest("hex");
  const provided = Buffer.from(input.proof, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  const matches =
    provided.length === wanted.length && timingSafeEqual(provided, wanted);

  if (!matches) {
    await query(
      `UPDATE auth_verification_challenges
          SET attempts = attempts + 1
        WHERE id = $1`,
      [input.challengeId],
    );
    await fail("Verification failed. Try again.");
  }

  await query(
    `UPDATE auth_verification_challenges SET consumed_at = now() WHERE id = $1`,
    [input.challengeId],
  );
  await query(
    `UPDATE user_verification_methods SET last_used_at = now(), updated_at = now()
      WHERE user_id = $1 AND method = 'biometric' AND destination = $2`,
    [input.userId, input.deviceId],
  );
  await markVerified(input.userId);
  await recordAuthEvent({
    userId: input.userId,
    action: "auth.verify.biometric",
    outcome: "success",
    ...input.meta,
  });
}

export interface VerificationClaim {
  userId: string;
  redirectUri: string;
  handoff: string;
}

/**
 * Redeems an emailed verification link.
 *
 * The challenge is consumed and a handoff code is minted in the same step,
 * so the browser lands on the app's callback exactly like a finished social
 * sign-in and trades the code for a session there.
 */
export async function claimVerificationLink(
  token: string,
): Promise<VerificationClaim | null> {
  const result = await query<{ user_id: string; redirect_uri: string }>(
    `DELETE FROM auth_verification_challenges
      WHERE token_hash = $1
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING user_id, redirect_uri`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;

  await markVerified(row.user_id);
  const handoff = await createHandoffCode(row.user_id, "verification");
  await recordAuthEvent({
    userId: row.user_id,
    action: "auth.verify.email_link",
    outcome: "success",
  });
  return { userId: row.user_id, redirectUri: row.redirect_uri, handoff };
}
