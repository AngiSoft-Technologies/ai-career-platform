import { AUTH_RELAY_URL } from "./auth";
import { PENDING_OAUTH_COOKIE } from "./auth-cookies";

/**
 * Helpers for the OAuth authorization flow.
 *
 * The provider needs two calls to run inside the session it created: one to
 * start the provider sign-in and one to resume the authorization request once
 * the user is signed in. They go through the same-origin relay, which the API
 * forwards to the provider. The provider cookie therefore stays a first-party
 * cookie on this origin and never reaches the identity logic, which lives in
 * the API.
 */

interface OAuthResponse {
  url?: string;
  redirect?: boolean;
}

/**
 * The provider's own steps stay on the provider's host.
 *
 * The provider sets a state cookie when it hands the browser to Google, and
 * it checks that cookie when Google returns. That step therefore has to
 * happen where the cookie is set — on the provider's host. Running it
 * through the relay would move the cookie to this origin, the provider
 * would not find it, and the sign-in would end at "state_mismatch".
 *
 * The flow's *challenge* cookie is a different thing: it is set when the
 * sign-in is requested through the relay, and it is what the middleware
 * exchanges the verifier for the session with. That one belongs here.
 */

/**
 * Raised when the sign-in was refused because too many attempts were made.
 *
 * The API answers with the number of seconds to wait, so the page can say
 * when to come back rather than only that it failed.
 */
export class OAuthRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many sign-in attempts");
    this.name = "OAuthRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function postOAuth(path: string, body: unknown): Promise<string | null> {
  const response = await fetch(`${AUTH_RELAY_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 429) {
    const payload = (await response.json().catch(() => null)) as {
      retry_after_seconds?: number;
    } | null;
    throw new OAuthRateLimitError(payload?.retry_after_seconds ?? 60);
  }
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as OAuthResponse | null;
  // The provider's URL is used as it is: its own steps have to happen on
  // its own host, where its state cookie is set and checked. See the note
  // above.
  return typeof payload?.url === "string" ? payload.url : null;
}

async function getOAuth(path: string): Promise<unknown> {
  const response = await fetch(`${AUTH_RELAY_URL}${path}`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/**
 * Reads the provider's signed authorization request from a URL.
 *
 * The provider hands the request over in two shapes: nested in an
 * "oauth_query" parameter, or spread across the query itself. Both are
 * signed, and the signature covers the values rather than the encoding, so
 * the request is handed back exactly as it arrived — re-encoded only when
 * something has to be taken out of it.
 *
 * A one-time verifier can ride along on the same query. It is not part of
 * the signed request and it is spent by the time the provider asks for
 * consent, so it is dropped before the request is handed back.
 */
export function readSignedRequest(params: {
  get(name: string): string | null;
  toString(): string;
}): string {
  const explicit = params.get("oauth_query");
  if (explicit) return explicit;

  const raw = params.toString();
  if (!raw) return "";

  const signed = new URLSearchParams(raw);
  // A request without a client and a signature is not a signed request —
  // it is somebody's idea of one.
  if (!signed.get("client_id") || !signed.get("sig")) return "";

  if (signed.has("neon_auth_session_verifier")) {
    signed.delete("neon_auth_session_verifier");
    return signed.toString();
  }
  return raw;
}

export interface PublicClient {
  client_id?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
}

/** Resumes an authorization request once the user has a session. */
export function continueAuthorization(oauthQuery: string): Promise<string | null> {
  return postOAuth("/oauth2/continue", { selected: true, oauth_query: oauthQuery });
}

/** Submits the user's decision on the consent screen. */
export function respondToConsent(
  accept: boolean,
  oauthQuery: string,
): Promise<string | null> {
  return postOAuth("/oauth2/consent", { accept, oauth_query: oauthQuery });
}

/**
 * Remembers the signed authorization request.
 *
 * The provider sends the browser back to this origin with a one-time
 * verifier rather than with the request itself, and the request is what the
 * provider resumes once the session exists. The proxy cannot read the
 * browser's storage, so the request is kept in a cookie — which is exactly
 * the one thing that has to survive the round trip.
 *
 * The cookie crosses sites to get here: it is set before the browser leaves
 * for the provider and read after it comes back, and a browser withholds a
 * "Lax" cookie from some of those trips. "None" is sent on every request
 * and is only accepted alongside "Secure", which this origin has.
 */
export function rememberPendingRequest(oauthQuery: string): void {
  if (typeof document === "undefined" || !oauthQuery) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PENDING_OAUTH_COOKIE}=${encodeURIComponent(oauthQuery)}; Path=/; Max-Age=600; SameSite=None${secure}`;
}

/**
 * Starts a provider sign-in that carries the pending authorization request.
 *
 * The provider verifies the signed query, signs the user in and resumes the
 * authorization request when the provider returns.
 */
export function startProviderSignIn(
  provider: string,
  oauthQuery: string,
): Promise<string | null> {
  rememberPendingRequest(oauthQuery);
  return postOAuth("/sign-in/social", {
    provider,
    oauth_query: oauthQuery,
    requestSignUp: true,
  });
}

/** Looks up the client that is asking for access. */
export async function fetchPublicClient(
  clientId: string,
): Promise<PublicClient | null> {
  const payload = (await getOAuth(
    `/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
  )) as PublicClient | null;
  return payload ?? null;
}

/**
 * Whether the browser already has a provider session.
 *
 * A pending authorization request can only be resumed once the provider has
 * signed the user in.
 */
export async function hasProviderSession(): Promise<boolean> {
  const payload = (await getOAuth("/get-session")) as { user?: unknown } | null;
  return Boolean(payload?.user);
}

export interface AuthorizationRequest {
  clientId: string;
  scopes: string[];
  resource: string | null;
  state: string | null;
}

/** Reads the parameters of a signed authorization request. */
export function parseAuthorizationRequest(
  oauthQuery: string,
): AuthorizationRequest {
  const params = new URLSearchParams(oauthQuery);
  const scopes = (params.get("scope") ?? "")
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
  return {
    clientId: params.get("client_id") ?? "",
    scopes,
    resource: params.get("resource"),
    state: params.get("state"),
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
