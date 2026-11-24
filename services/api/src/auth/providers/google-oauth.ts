import { createHash, randomBytes } from "node:crypto";
import { config } from "../../config.js";
import { query } from "../../db/pool.js";
import { AuthNotConfiguredError } from "../tokens.js";
import { AuthProviderError } from "./errors.js";
import { verifyGoogleIdToken, type GoogleIdentity } from "./google.js";

/**
 * Google sign-in, run by this API.
 *
 * The browser is sent straight to Google's authorization endpoint with a
 * PKCE challenge; Google returns an authorization code to the API's own
 * callback; the API redeems it at Google's token endpoint and verifies the
 * returned ID token against Google's published keys. No identity provider
 * sits in the middle: the session, the state and the identity records are
 * all ours.
 */

const GOOGLE_PROVIDER = "google";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_TTL_SECONDS = 600;

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export { GOOGLE_PROVIDER };

function clientId(): string {
  const id = config.GOOGLE_WEB_CLIENT_ID;
  if (!id) {
    throw new AuthNotConfiguredError(
      "GOOGLE_WEB_CLIENT_ID is required for Google sign-in",
    );
  }
  return id;
}

function clientSecret(): string {
  const secret = config.GOOGLE_CLIENT_SECRET;
  if (!secret) {
    throw new AuthNotConfiguredError(
      "GOOGLE_CLIENT_SECRET is required for Google sign-in",
    );
  }
  return secret;
}

/** The API's own callback. Google always returns here first. */
export function oauthCallbackUrl(): string {
  return `${config.API_URL.replace(/\/$/, "")}/v1/auth/google/callback`;
}

/**
 * Where the API is allowed to send the browser after a successful sign-in.
 *
 * Without this an attacker could hand a victim a `redirect_uri` they control
 * and harvest the freshly minted access and refresh tokens.
 */
export function assertRedirectAllowed(redirectUri: string): string {
  const allowlist = config.AUTH_OAUTH_REDIRECT_ALLOWLIST.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const allowed = [...allowlist, ...config.WEB_ORIGINS].filter(Boolean);

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new AuthProviderError(
      "The redirect target is not a valid URL",
      "INVALID_REDIRECT",
      400,
    );
  }

  const isCustomScheme = !parsed.protocol.includes("http");
  if (isCustomScheme) {
    const scheme = `${parsed.protocol}//`;
    if (!allowed.some((entry) => entry.startsWith(scheme))) {
      throw new AuthProviderError(
        "The redirect target is not allowed",
        "INVALID_REDIRECT",
        400,
      );
    }
    return redirectUri;
  }

  const origin = parsed.origin;
  if (!allowed.some((entry) => entry === origin)) {
    throw new AuthProviderError(
      "The redirect target is not allowed",
      "INVALID_REDIRECT",
      400,
    );
  }
  return redirectUri;
}

export interface OAuthStart {
  /** Where the browser must be sent to begin the flow. */
  authorizationUrl: string;
  /** Opaque value the API correlates the callback with. */
  state: string;
}

/**
 * Creates a PKCE pair, persists the verifier, and returns the URL the browser
 * has to visit to start the flow.
 */
export async function beginOAuthFlow(options: {
  provider: string;
  appRedirectUri: string;
  /** When set the flow links the provider identity to this account. */
  linkUserId?: string | null;
}): Promise<OAuthStart> {
  const state = base64url(randomBytes(32));
  const codeVerifier = base64url(randomBytes(48));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest(),
  );

  await query(
    `INSERT INTO auth_oauth_states
       (state, provider, code_verifier, app_redirect_uri, mode, user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval)`,
    [
      state,
      options.provider,
      codeVerifier,
      options.appRedirectUri,
      options.linkUserId ? "link" : "signin",
      options.linkUserId ?? null,
      String(STATE_TTL_SECONDS),
    ],
  );

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: oauthCallbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    access_type: "online",
    // Always offer the account chooser: a shared device should never sign
    // somebody in as the last person who used Google on it.
    prompt: "select_account",
  });

  return {
    authorizationUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state,
  };
}

interface StoredState {
  provider: string;
  code_verifier: string;
  app_redirect_uri: string;
  mode: string;
  user_id: string | null;
}

/**
 * Claims a state value. The row is deleted on use so a callback can only be
 * redeemed once.
 */
async function claimState(state: string): Promise<StoredState | null> {
  const result = await query<StoredState>(
    `DELETE FROM auth_oauth_states
      WHERE state = $1 AND mode <> 'ticket' AND expires_at > now()
      RETURNING provider, code_verifier, app_redirect_uri, mode, user_id`,
    [state],
  );
  return result.rows[0] ?? null;
}

/**
 * Issues a single-use ticket that binds a provider sign-in to an account.
 *
 * The ticket is handed to the browser in a redirect, so it has to carry the
 * account reference without exposing a credential.
 */
export async function createLinkTicket(userId: string): Promise<string> {
  const ticket = base64url(randomBytes(32));
  await query(
    `INSERT INTO auth_oauth_states
       (state, provider, code_verifier, app_redirect_uri, mode, user_id, expires_at)
     VALUES ($1, $2, '', '', 'ticket', $3, now() + ($4 || ' seconds')::interval)`,
    [ticket, GOOGLE_PROVIDER, userId, String(STATE_TTL_SECONDS)],
  );
  return ticket;
}

export interface LinkTicket {
  userId: string;
  provider: string;
}

/** Claims a link ticket. */
export async function claimLinkTicket(
  ticket: string,
): Promise<LinkTicket | null> {
  const result = await query<{ user_id: string; provider: string }>(
    `DELETE FROM auth_oauth_states
      WHERE state = $1 AND mode = 'ticket' AND expires_at > now()
      RETURNING user_id, provider`,
    [ticket],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { userId: row.user_id, provider: row.provider };
}

/**
 * Redeems the authorization code at Google and returns the verified identity.
 */
export async function completeOAuthFlow(options: {
  code: string;
  state: string;
}): Promise<{
  identity: GoogleIdentity;
  appRedirectUri: string;
  mode: string;
  userId: string | null;
}> {
  const stored = await claimState(options.state);
  if (!stored) {
    throw new AuthProviderError(
      "This sign-in attempt has expired. Please try again.",
      "INVALID_STATE",
      400,
    );
  }

  try {
    return await redeemAuthorizationCode(options.code, stored);
  } catch (error) {
    // The caller needs the app's redirect URI even on failure so a mobile
    // sign-in can be sent back to the app instead of dead-ending on the
    // web sign-in page while the app waits for its deep link.
    if (error instanceof Error) {
      (error as Error & { appRedirectUri?: string }).appRedirectUri =
        stored.app_redirect_uri;
    }
    throw error;
  }
}

async function redeemAuthorizationCode(
  code: string,
  stored: StoredState,
): Promise<{
  identity: GoogleIdentity;
  appRedirectUri: string;
  mode: string;
  userId: string | null;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthCallbackUrl(),
    client_id: clientId(),
    client_secret: clientSecret(),
    code_verifier: stored.code_verifier,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const description =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : `HTTP ${response.status}`;
    throw new AuthProviderError(
      `The sign-in could not be completed (${description})`,
      "PROVIDER_REJECTED",
      401,
    );
  }

  const idToken =
    typeof payload.id_token === "string" ? payload.id_token : null;
  if (!idToken) {
    throw new AuthProviderError(
      "The sign-in did not return a token",
      "PROVIDER_REJECTED",
      502,
    );
  }

  // The ID token is verified against Google's own keys, with this client's
  // id as the audience — a token minted for any other client is refused.
  const identity = await verifyGoogleIdToken(idToken);

  return {
    identity,
    appRedirectUri: stored.app_redirect_uri,
    mode: stored.mode,
    userId: stored.user_id,
  };
}
