"use client";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "https://job-radar-api-angisoft.fly.dev/v1"
).replace(/\/$/, "");

/**
 * Auth always goes through the same-origin Next.js proxy at /api/auth.
 * Talking to the Neon Auth origin directly would make the session cookie a
 * third-party cookie, which Chrome and Firefox block, leaving the session null.
 */
export const NEON_AUTH_URL = "/api/auth";

export const NEON_AUTH_UPSTREAM_URL = (
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ??
  "https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth"
).replace(/\/$/, "");

export const WS_URL = API_URL.replace(/\/v1$/, "") + "/v1/ws";

const TOKEN_KEY = "jr.auth.token";
const SESSION_KEY = "jr.auth.session";
const TOKEN_TTL_KEY = "jr.auth.token.exp";

export interface Session {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
  roles: string[];
  permissions: string[];
  expiresAt?: string | null;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function cachedToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const expiry = Number(window.localStorage.getItem(TOKEN_TTL_KEY) ?? 0);
  if (!token) return null;
  if (expiry && expiry < Date.now()) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(TOKEN_TTL_KEY);
    return null;
  }
  if (tokenExpiry(token) !== null && tokenExpiry(token)! < Date.now()) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(TOKEN_TTL_KEY);
    return null;
  }
  return token;
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_TTL_KEY);
}

function tokenExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), "=");
    const json = atob(padded);
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp !== "number") return null;
    return claims.exp * 1000;
  } catch {
    return null;
  }
}

export function cachedSession(): Session | null {
  return readJson<Session>(SESSION_KEY);
}

export function storeSession(session: Session): void {
  writeJson(SESSION_KEY, session);
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_TTL_KEY);
}

let tokenRequest: Promise<string | null> | null = null;

async function requestToken(): Promise<string | null> {
  const response = await fetch(`${NEON_AUTH_URL}/token`, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    token?: string;
    expiresAt?: string | number;
  } | null;
  if (!payload?.token) return null;
  window.localStorage.setItem(TOKEN_KEY, payload.token);
  const claimExpiry = tokenExpiry(payload.token);
  const expiry =
    typeof payload.expiresAt === "number"
      ? payload.expiresAt * 1000
      : typeof payload.expiresAt === "string"
        ? new Date(payload.expiresAt).getTime()
        : claimExpiry;
  if (expiry) {
    window.localStorage.setItem(TOKEN_TTL_KEY, String(expiry));
  }
  return payload.token;
}

export async function getToken(): Promise<string | null> {
  const cached = cachedToken();
  if (cached) return cached;
  if (tokenRequest) return tokenRequest;
  tokenRequest = requestToken()
    .catch(() => null)
    .finally(() => {
      tokenRequest = null;
    });
  return tokenRequest;
}

export async function fetchSession(): Promise<Session | null> {
  const response = await fetch(`${NEON_AUTH_URL}/get-session`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    user?: { id: string; email: string; name?: string | null; image?: string | null };
    session?: { expiresAt?: string | number };
  } | null;
  if (!payload?.user) return null;

  const token = await getToken();
  const session: Session = {
    user: {
      id: payload.user.id,
      email: payload.user.email,
      name: payload.user.name ?? null,
      image: payload.user.image ?? null,
    },
    roles: [],
    permissions: [],
    expiresAt:
      typeof payload.session?.expiresAt === "number"
        ? new Date(payload.session.expiresAt * 1000).toISOString()
        : (payload.session?.expiresAt ?? null),
  };
  storeSession(session);
  if (!token) return null;
  return session;
}

export async function signIn(email: string, password: string): Promise<boolean> {
  const response = await fetch(`${NEON_AUTH_URL}/sign-in/email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, callbackURL: window.location.origin }),
  });
  if (!response.ok) return false;
  await fetchSession();
  return true;
}

export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<boolean> {
  const response = await fetch(`${NEON_AUTH_URL}/sign-up/email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name,
      callbackURL: window.location.origin,
    }),
  });
  if (!response.ok) return false;
  await fetchSession();
  return true;
}

export async function signOut(): Promise<void> {
  try {
    await fetch(`${NEON_AUTH_URL}/sign-out`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    return;
  } finally {
    clearSession();
  }
}
