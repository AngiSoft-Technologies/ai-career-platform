import { config } from "../config.js";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";

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

let cachedSession: { cookie: string; expiresAt: number } | null = null;

function authBaseUrl(): string {
  if (!config.NEON_AUTH_BASE_URL) {
    throw new AuthAdminError(
      "Authentication service is not configured",
      "AUTH_NOT_CONFIGURED",
    );
  }
  return config.NEON_AUTH_BASE_URL.replace(/\/$/, "");
}

function requestOrigin(): string {
  return config.INVITE_BASE_URL ?? config.WEB_ORIGINS[0] ?? "http://localhost:3000";
}

async function serviceSessionCookie(): Promise<string> {
  if (cachedSession && Date.now() < cachedSession.expiresAt) {
    return cachedSession.cookie;
  }

  const email = config.INVITE_SERVICE_EMAIL;
  const password = config.INVITE_SERVICE_PASSWORD;
  if (!email || !password) {
    throw new AuthAdminError(
      "Invitation service account is not configured",
      "INVITE_SERVICE_MISSING",
    );
  }

  const response = await fetch(`${authBaseUrl()}/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: requestOrigin(),
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.warn(
      { status: response.status, body: body.slice(0, 200) },
      "Invite service sign-in failed",
    );
    throw new AuthAdminError(
      "Invitation service account could not sign in",
      "INVITE_SERVICE_SIGN_IN_FAILED",
      response.status,
    );
  }

  const cookies = response.headers.getSetCookie();
  const cookie = cookies
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
  if (!cookie) {
    throw new AuthAdminError(
      "Invitation service account session was empty",
      "INVITE_SERVICE_SESSION_EMPTY",
    );
  }

  cachedSession = { cookie, expiresAt: Date.now() + 10 * 60_000 };
  return cookie;
}

async function adminPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const cookie = await serviceSessionCookie();
  const response = await fetch(`${authBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: requestOrigin(),
      cookie,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    logger.warn(
      { path, status: response.status, body: text.slice(0, 200) },
      "Auth admin request failed",
    );
    throw new AuthAdminError(
      "Authentication service rejected the request",
      "AUTH_ADMIN_REQUEST_FAILED",
      response.status,
    );
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function adminCreateUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ id: string; email: string; name: string }> {
  const result = await adminPost<{
    user?: { id: string; email: string; name: string };
    id?: string;
    email?: string;
    name?: string;
  }>("/admin/create-user", input);

  const id = result.user?.id ?? result.id;
  if (!id) {
    throw new AuthAdminError(
      "Authentication service did not return a user id",
      "AUTH_ADMIN_NO_USER_ID",
    );
  }
  return {
    id,
    email: result.user?.email ?? result.email ?? input.email,
    name: result.user?.name ?? result.name ?? input.name,
  };
}

export async function adminSetUserPassword(input: {
  userId: string;
  newPassword: string;
}): Promise<void> {
  await adminPost("/admin/set-user-password", {
    userId: input.userId,
    newPassword: input.newPassword,
  });
}

export async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const result = await query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name
       FROM neon_auth."user"
      WHERE lower(email) = lower($1)
        AND banned IS NOT TRUE
      LIMIT 1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function requestPasswordReset(input: {
  email: string;
  redirectTo: string;
}): Promise<boolean> {
  const response = await fetch(`${authBaseUrl()}/request-password-reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: requestOrigin(),
    },
    body: JSON.stringify({ email: input.email, redirectTo: input.redirectTo }),
  });

  if (!response.ok) {
    logger.warn(
      { status: response.status },
      "Password reset email request failed",
    );
    return false;
  }
  return true;
}

export function clearAuthAdminSession(): void {
  cachedSession = null;
}
