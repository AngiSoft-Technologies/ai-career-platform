"use client";

/**
 * The browser talks to the mboqara API and to nothing else.
 *
 * The API owns identity: it verifies credentials, runs the social sign-in
 * handshake with the identity provider and mints the tokens this app uses. No
 * provider URL, provider token or provider cookie is ever handled here.
 */

/**
 * Client calls go through the same-origin `/api` proxy so the session can
 * live in httpOnly cookies on this domain. `NEXT_PUBLIC_API_ORIGIN` is only
 * needed for things a browser cannot proxy, like the WebSocket handshake.
 */
export const API_URL = "/api";

const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  process.env.NEXT_PUBLIC_API_URL ??
  "https://api.mboqara.angisoft.co.ke/v1"
).replace(/\/$/, "");

export const WS_URL = `${API_ORIGIN.replace(/\/v1$/, "")}/v1/ws`;

const TOKEN_KEY = "mboqara.auth.token";
const REFRESH_TOKEN_KEY = "mboqara.auth.refresh";
const SESSION_KEY = "mboqara.auth.session";
const TOKEN_TTL_KEY = "mboqara.auth.token.exp";
const NEXT_KEY = "mboqara.auth.next";

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
  verifiedAt?: string | null;
  requiresVerification?: boolean;
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

/**
 * Tokens live in sessionStorage, not localStorage: the refresh credential
 * itself is an httpOnly cookie now, so the only thing kept here is the
 * short-lived access token a tab needs for the WebSocket handshake. The
 * cached session profile stays in localStorage because it is UI state, not
 * a credential.
 */
function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    return;
  }
}

function removeLocal(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
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
 * Cached reads and queued writes live in `mboqara.cache:<userId>:…` and
 * `mboqara.outbox:<userId>`. They are scoped per account, so the only remaining
 * hazard is orphaned data from a previous account lingering in storage. Purge
 * it when the identity actually changes.
 */
const USER_SCOPED_PREFIXES = ["mboqara.cache:", "mboqara.outbox:"];

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
  // The refresh credential lives in an httpOnly cookie; a copy in web
  // storage would only widen what an XSS could steal. Older sessions that
  // still carry one are ignored.
  removeLocal(REFRESH_TOKEN_KEY);
  const expiry = new Date(payload.expiresAt).getTime();
  if (!Number.isNaN(expiry)) writeLocal(TOKEN_TTL_KEY, String(expiry));
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "include",
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
    try {
      // The refresh credential normally arrives as an httpOnly cookie; the
      // body field is only a fallback for sessions minted before cookies.
      const payload = await post<AuthSessionResponse>(
        "/auth/refresh",
        refreshToken ? { refreshToken } : {},
      );
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
  const read = async (token: string | null): Promise<Response> =>
    fetch(`${API_URL}/auth/session`, {
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
    });

  // The access cookie usually answers this directly; only when it has
  // expired do we spend a refresh rotation to mint a new one.
  let response = await read(cachedToken());
  if (response.status === 401) {
    const token = await getToken();
    if (!token) return null;
    response = await read(token);
  }
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as {
    user?: { id: string; email: string; name?: string | null; image?: string | null };
    roles?: string[];
    permissions?: string[];
    verifiedAt?: string | null;
    requiresVerification?: boolean;
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
    verifiedAt: payload.verifiedAt ?? null,
    requiresVerification: payload.requiresVerification === true,
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
  // The /api proxy maps this onto the API's /v1/auth/google/start.
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
    credentials: "include",
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
 * This is the legacy shape: the tokens themselves in the fragment. The API
 * no longer sends it — it sends a single-use code instead — but the branch
 * is kept so a web build can be deployed before the API build without
 * breaking sign-in for anyone in between. Remove it once the API that
 * speaks handoff codes is the only one deployed.
 */
export function storeSessionFromFragment(fragment: string): boolean {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  if (params.get("linked") === "1") return true;

  const token = params.get("access_token") ?? "";
  const refreshToken = params.get("refresh_token") ?? "";
  if (!token || !refreshToken) return false;

  writeLocal(TOKEN_KEY, token);
  const expiresAt = params.get("expires_at");
  if (expiresAt) {
    const expiry = new Date(expiresAt).getTime();
    if (!Number.isNaN(expiry)) writeLocal(TOKEN_TTL_KEY, String(expiry));
  }
  return true;
}

/**
 * Trades the one-time code from the callback for a session.
 *
 * The code is what the API puts in the callback fragment now. It carries no
 * privilege on its own: it is redeemed once, at this endpoint, which is
 * where the tokens are actually minted. A code that was already spent, or
 * one that has expired, is refused.
 */
export async function exchangeHandoffCode(code: string): Promise<boolean> {
  try {
    const payload = await post<AuthSessionResponse>("/auth/exchange", { code });
    if (!payload?.token) return false;
    storeAuthSession(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Completes a social sign-in from the callback fragment.
 *
 * Three shapes are accepted:
 *
 *   * `code=<handoff>` — the current one: a single-use code that is
 *     exchanged for the session;
 *   * `linked=1` — a provider identity was linked to an existing account,
 *     so the session is already there and there is nothing to exchange;
 *   * `access_token=…` — the legacy shape, for an API that has not been
 *     redeployed yet.
 */
export async function completeSignInFromFragment(
  fragment: string,
): Promise<boolean> {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  if (params.get("linked") === "1") return true;

  const code = params.get("code");
  if (code) return exchangeHandoffCode(code);

  return storeSessionFromFragment(fragment);
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
  try {
    // The refresh credential is an httpOnly cookie; the API revokes it and
    // clears both cookies on the way out.
    await post("/auth/sign-out", {});
  } catch {
    // The local session is cleared either way.
  } finally {
    clearSession();
  }
}

// ---------------------------------------------------------------------------
// Step-up verification
// ---------------------------------------------------------------------------

export type VerificationMethodName =
  | "totp"
  | "email_link"
  | "email_otp"
  | "passkey";

export interface VerificationMethod {
  method: VerificationMethodName;
  destination: string;
  isDefault: boolean;
  enrolled: boolean;
  lastUsedAt?: string | null;
}

export interface VerificationRequestResult {
  method: VerificationMethodName;
  requiresCode: boolean;
  sent: boolean;
}

export async function fetchVerificationMethods(): Promise<VerificationMethod[]> {
  const response = await fetch(`${API_URL}/auth/verification/methods`, {
    headers: { accept: "application/json" },
    credentials: "include",
  });
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => null)) as {
    methods?: VerificationMethod[];
  } | null;
  return payload?.methods ?? [];
}

export async function startTotpEnrollment(): Promise<{
  secret: string;
  otpauthUrl: string;
} | null> {
  try {
    return await post<{ secret: string; otpauthUrl: string }>(
      "/auth/verification/totp/enroll",
      {},
    );
  } catch {
    return null;
  }
}

export async function confirmTotpEnrollment(
  code: string,
): Promise<VerificationMethod[] | null> {
  try {
    const payload = await post<{ methods?: VerificationMethod[] }>(
      "/auth/verification/totp/confirm",
      { code },
    );
    return payload.methods ?? null;
  } catch {
    return null;
  }
}

/**
 * Asks the API to start a verification. TOTP answers immediately (the code
 * the user types is the proof); email_link sends a single-use link.
 */
export async function requestVerification(input: {
  method?: VerificationMethodName;
  redirectUri?: string;
}): Promise<VerificationRequestResult | null> {
  try {
    return await post<VerificationRequestResult>(
      "/auth/verification/request",
      {
        ...(input.method ? { method: input.method } : {}),
        redirectUri: input.redirectUri ?? webAuthCallbackUrl(),
      },
    );
  } catch {
    return null;
  }
}

/** Verifies a TOTP step-up code, then refreshes the cached session. */
export async function verifyTotp(code: string): Promise<boolean> {
  try {
    await post("/auth/verification/verify", { method: "totp", code });
    await fetchSession();
    return true;
  } catch {
    return false;
  }
}
