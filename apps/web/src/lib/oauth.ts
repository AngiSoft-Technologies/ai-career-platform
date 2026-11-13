import { AUTH_RELAY_URL } from "./auth";

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
 * Keeps the browser on this origin.
 *
 * The provider answers with absolute URLs on its own host (".../neondb/auth/
 * sign-in/social/init?token=..."). Following one of those takes the browser
 * off this origin, and the flow's cookies — the challenge cookie that ties
 * the sign-in to the session it creates — are left behind. The provider then
 * cannot match the challenge and answers `state_mismatch`, and the visitor is
 * bounced back to the sign-in page for ever.
 *
 * The relay path stands in for the provider's base path, so the same request
 * is made from this origin and the cookie is sent with it.
 */
function onThisOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    const marker = "/neondb/auth";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return url;
    return `${AUTH_RELAY_URL}${parsed.pathname.slice(index + marker.length)}${parsed.search}`;
  } catch {
    return url;
  }
}

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
  return typeof payload?.url === "string" ? onThisOrigin(payload.url) : null;
}

async function getOAuth(path: string): Promise<unknown> {
  const response = await fetch(`${AUTH_RELAY_URL}${path}`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
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
 * Starts a provider sign-in that carries the pending authorization request.
 *
 * The provider verifies the signed query, signs the user in and resumes the
 * authorization request when the provider returns.
 */
export function startProviderSignIn(
  provider: string,
  oauthQuery: string,
): Promise<string | null> {
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
