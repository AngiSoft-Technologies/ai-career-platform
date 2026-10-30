"use client";

/**
 * The browser talks to the Job Radar API and to nothing else.
 *
 * The API owns identity: it verifies credentials, runs the social sign-in
 * handshake with the identity provider and mints the tokens this app uses. No
 * provider URL, provider token or provider cookie is ever handled here.
 */

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "https://job-radar-api-angisoft.fly.dev/v1"
).replace(/\/$/, "");

export const WS_URL = API_URL.replace(/\/v1$/, "") + "/v1/ws";

/**
 * Same-origin relay for the identity provider.
 *
 * Two steps of the OAuth authorization flow have to run inside the session the
 * provider created. The relay keeps the provider cookie on this origin (a
 * first-party cookie) while the request itself is handled by the API.
 */
export const AUTH_RELAY_URL = "/api/auth";

const TOKEN_KEY = "jr.auth.token";
const REFRESH_TOKEN_KEY = "jr.auth.refresh";
const SESSION_KEY = "jr.auth.session";
const TOKEN_TTL_KEY = "jr.auth.token.exp";
const NEXT_KEY = "jr.auth.next";

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

function tokenExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised.padEnd(
      normalised.length + ((4 - (normalised.length % 4)) % 4),
      "=",
    );
    const json = atob(padded);
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp !== "number") return null;
    return claims.exp * 1000;
  } catch {
    return null;
  }
}

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function removeLocal(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

/** The access token, as long as it is still valid. */
export function cachedToken(): string | null {
  const token = readLocal(TOKEN_KEY);
  if (!token) return null;
  const expiry = Number(readLocal(TOKEN_TTL_KEY) ?? 0);
  if (expiry && expiry < Date.now()) {
    removeLocal(TOKEN_KEY);
    removeLocal(TOKEN_TTL_KEY);
    return null;
  }
  const claimExpiry = tokenExpiry(token);
  if (claimExpiry !== null && claimExpiry < Date.now()) {
    removeLocal(TOKEN_KEY);
    removeLocal(TOKEN_TTL_KEY);
    return null;
  }
  return token;
}

export function clearToken(): void {
  removeLocal(TOKEN_KEY);
  removeLocal(TOKEN_TTL_KEY);
}

export function cachedRefreshToken(): string | null {
  return readLocal(REFRESH_TOKEN_KEY);
}

export function cachedSession(): Session | null {
  return readJson<Session>(SESSION_KEY);
}

/**
 * Cached reads and queued writes live in `jr.cache:<userId>:…` and
 * `jr.outbox:<userId>`. They are scoped per account, so the only remaining
 * hazard is orphaned data from a previous account lingering in storage. Purge
 * it when the identity actually changes.
 */
const USER_SCOPED_PREFIXES = ["jr.cache:", "jr.outbox:"];

function purgeOtherAccounts(nextUserId: string | undefined): void {
  if (typeof window === "undefined") return;
  const previous = cachedSession()?.user.id;
  if (!nextUserId || previous === nextUserId) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (USER_SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in private mode; the namespacing still holds.
  }
}

export function storeSession(session: Session): void {
  purgeOtherAccounts(session.user?.id);
  writeJson(SESSION_KEY, session);
}

export function clearSession(): void {
  removeLocal(SESSION_KEY);
  removeLocal(TOKEN_KEY);
  removeLocal(TOKEN_TTL_KEY);
  removeLocal(REFRESH_TOKEN_KEY);
}

interface AuthSessionResponse {
  token: string;
  tokenType: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  user?: { id: string; email: string; name?: string | null } | null;
  roles?: string[];
  permissions?: string[];
}

function storeAuthSession(payload: AuthSessionResponse): void {
  writeLocal(TOKEN_KEY, payload.token);
  writeLocal(REFRESH_TOKEN_KEY, payload.refreshToken);
  const expiry = new Date(payload.expiresAt).getTime();
  if (!Number.isNaN(expiry)) writeLocal(TOKEN_TTL_KEY, String(expiry));
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

let refreshRequest: Promise<string | null> | null = null;

/**
 * Returns a usable access token.
 *
 * The access token is short lived. When it has expired the refresh token is
 * exchanged for a new pair at the API, which rotates the refresh token.
 */
export async function getToken(): Promise<string | null> {
  const cached = cachedToken();
  if (cached) return cached;
  if (refreshRequest) return refreshRequest;

  refreshRequest = (async () => {
    const refreshToken = cachedRefreshToken();
    if (!refreshToken) return null;
    try {
      const payload = await post<AuthSessionResponse>("/auth/refresh", {
        refreshToken,
      });
      if (!payload?.token) return null;
      storeAuthSession(payload);
      return payload.token;
    } catch {
      clearSession();
      return null;
    } finally {
      refreshRequest = null;
    }
  })();

  return refreshRequest;
}

/** Reads the current session from the API. */
export async function fetchSession(): Promise<Session | null> {
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${API_URL}/auth/session`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as {
    user?: { id: string; email: string; name?: string | null; image?: string | null };
    roles?: string[];
    permissions?: string[];
  } | null;
  if (!payload?.user) return null;

  const session: Session = {
    user: {
      id: payload.user.id,
      email: payload.user.email,
      name: payload.user.name ?? null,
      image: payload.user.image ?? null,
    },
    roles: payload.roles ?? [],
    permissions: payload.permissions ?? [],
    expiresAt: null,
  };
  storeSession(session);
  return session;
}

export async function signIn(email: string, password: string): Promise<boolean> {
  try {
    const payload = await post<AuthSessionResponse>("/auth/sign-in", {
      email,
      password,
    });
    storeAuthSession(payload);
    await fetchSession();
    return true;
  } catch {
    return false;
  }
}

export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<boolean> {
  try {
    const payload = await post<AuthSessionResponse>("/auth/sign-up", {
      email,
      password,
      name,
    });
    storeAuthSession(payload);
    await fetchSession();
    return true;
  } catch {
    return false;
  }
}

/** Where the API should send the browser once the social sign-in completes. */
export function webAuthCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

export function rememberNextPath(next: string): void {
  writeLocal(NEXT_KEY, next);
}

export function takeNextPath(): string {
  const next = readLocal(NEXT_KEY) ?? "/dashboard";
  removeLocal(NEXT_KEY);
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

/**
 * Starts the Google sign-in flow.
 *
 * The browser is sent to the API, which runs the provider consent and sends
 * the browser back to {@link webAuthCallbackUrl} with the session.
 */
export async function signInWithGoogle(next = "/dashboard"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  rememberNextPath(next);
  const redirectUri = encodeURIComponent(webAuthCallbackUrl());
  window.location.assign(`${API_URL}/auth/google/start?redirect_uri=${redirectUri}`);
  return true;
}

/**
 * Connects a Google account to the signed-in account.
 *
 * The API issues a single-use ticket that carries the account reference, so
 * the callback links the provider identity instead of creating a new account.
 */
export async function linkGoogle(next = "/settings"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const token = await getToken();
  if (!token) return false;

  const response = await fetch(`${API_URL}/auth/google/link-ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (!response.ok) return false;

  const payload = (await response.json().catch(() => null)) as {
    ticket?: string;
  } | null;
  if (!payload?.ticket) return false;

  rememberNextPath(next);
  const redirectUri = encodeURIComponent(webAuthCallbackUrl());
  window.location.assign(
    `${API_URL}/auth/google/link/start?ticket=${encodeURIComponent(payload.ticket)}&redirect_uri=${redirectUri}`,
  );
  return true;
}

/**
 * Stores the session the API handed back through the callback fragment.
 *
 * The tokens travel in the fragment so they are never sent to a server, never
 * logged and never stored in browser history.
 */
export function storeSessionFromFragment(fragment: string): boolean {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  if (params.get("linked") === "1") return true;

  const token = params.get("access_token") ?? "";
  const refreshToken = params.get("refresh_token") ?? "";
  if (!token || !refreshToken) return false;

  writeLocal(TOKEN_KEY, token);
  writeLocal(REFRESH_TOKEN_KEY, refreshToken);
  const expiresAt = params.get("expires_at");
  if (expiresAt) {
    const expiry = new Date(expiresAt).getTime();
    if (!Number.isNaN(expiry)) writeLocal(TOKEN_TTL_KEY, String(expiry));
  }
  return true;
}

/**
 * Asks the API to email a password reset link.
 *
 * The API always reports success so the form cannot be used to find out which
 * addresses have an account.
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  try {
    await post("/auth/password/reset-request", { email });
    return true;
  } catch {
    return false;
  }
}

/** Sets a new password with a reset token and signs the user in. */
export async function resetPassword(
  token: string,
  password: string,
): Promise<boolean> {
  try {
    const payload = await post<AuthSessionResponse>("/auth/password/reset", {
      token,
      password,
    });
    storeAuthSession(payload);
    await fetchSession();
    return true;
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  const refreshToken = cachedRefreshToken();
  try {
    if (refreshToken) {
      await post("/auth/sign-out", { refreshToken });
    }
  } catch {
    // The local session is cleared either way.
  } finally {
    clearSession();
  }
}
