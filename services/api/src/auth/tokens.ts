import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";
import { query } from "../db/pool.js";

const ISSUER = "job-radar";
const AUDIENCE = "job-radar";
const ACCESS_TYPE = "access";
const DEVELOPMENT_SECRET = "job-radar-development-secret";

export class AuthNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthNotConfiguredError";
  }
}

export class AuthTokenError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "AuthTokenError";
  }
}

function accessSecret(): Uint8Array {
  const secret = config.JWT_SECRET;
  const insecure =
    !secret ||
    secret === DEVELOPMENT_SECRET ||
    secret.trim().length < 32;
  if (config.NODE_ENV === "production" && insecure) {
    throw new AuthNotConfiguredError(
      "JWT_SECRET must be set to a unique value of at least 32 characters",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface AccessToken {
  token: string;
  expiresAt: Date;
}

export async function signAccessToken(userId: string): Promise<AccessToken> {
  const ttl = config.AUTH_ACCESS_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const token = await new SignJWT({ typ: ACCESS_TYPE })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(accessSecret());
  return { token, expiresAt };
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.typ !== ACCESS_TYPE) return null;
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface RefreshToken {
  token: string;
  id: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshContext {
  userAgent?: string | null;
  ip?: string | null;
}

export async function issueRefreshToken(
  userId: string,
  context: RefreshContext = {},
  familyId: string = randomUUID(),
  parentId: string | null = null,
): Promise<RefreshToken> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(
    Date.now() + config.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000,
  );

  const result = await query<{ id: string }>(
    `INSERT INTO auth_refresh_tokens
       (user_id, family_id, token_hash, parent_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      userId,
      familyId,
      tokenHash,
      parentId,
      expiresAt,
      context.userAgent ?? null,
      context.ip ?? null,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) throw new Error("REFRESH_TOKEN_CREATE_FAILED");

  return { token: raw, id, familyId, expiresAt };
}

interface RefreshRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/**
 * Rotates a refresh token. A presented token that was already rotated is treated
 * as theft: the whole family is revoked, so both the attacker and the victim are
 * forced to sign in again.
 */
export async function rotateRefreshToken(
  raw: string,
  context: RefreshContext = {},
): Promise<{ userId: string; refresh: RefreshToken }> {
  const tokenHash = hashRefreshToken(raw);
  const found = await query<RefreshRow>(
    `SELECT id, user_id, family_id, expires_at, revoked_at
       FROM auth_refresh_tokens
      WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = found.rows[0];
  if (!row) {
    throw new AuthTokenError("Refresh token is not recognized", "TOKEN_INVALID");
  }

  if (row.revoked_at) {
    await query(
      `UPDATE auth_refresh_tokens
          SET revoked_at = now()
        WHERE family_id = $1
          AND revoked_at IS NULL`,
      [row.family_id],
    );
    throw new AuthTokenError(
      "Refresh token has already been used",
      "TOKEN_REUSED",
    );
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AuthTokenError("Refresh token has expired", "TOKEN_EXPIRED");
  }

  // Claim the token atomically so two concurrent refreshes cannot both succeed.
  const claimed = await query<{ id: string }>(
    `UPDATE auth_refresh_tokens
        SET revoked_at = now()
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING id`,
    [row.id],
  );
  if (!claimed.rows[0]) {
    await query(
      `UPDATE auth_refresh_tokens
          SET revoked_at = now()
        WHERE family_id = $1
          AND revoked_at IS NULL`,
      [row.family_id],
    );
    throw new AuthTokenError(
      "Refresh token has already been used",
      "TOKEN_REUSED",
    );
  }

  const refresh = await issueRefreshToken(
    row.user_id,
    context,
    row.family_id,
    row.id,
  );
  await query(
    `UPDATE auth_refresh_tokens SET replaced_by = $2 WHERE id = $1`,
    [row.id, refresh.id],
  );

  return { userId: row.user_id, refresh };
}

export async function revokeRefreshToken(raw: string): Promise<boolean> {
  const result = await query(
    `UPDATE auth_refresh_tokens
        SET revoked_at = now()
      WHERE token_hash = $1
        AND revoked_at IS NULL`,
    [hashRefreshToken(raw)],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await query(
    `UPDATE auth_refresh_tokens
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL`,
    [userId],
  );
}
