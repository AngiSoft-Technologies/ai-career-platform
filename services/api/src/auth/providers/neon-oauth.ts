import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../../config.js";
import { query } from "../../db/pool.js";
import { AuthNotConfiguredError } from "../tokens.js";
import { AuthProviderError } from "./errors.js";

/**
 * Neon Auth is an OAuth 2.1 authorization server in its own right
 * (`/.well-known/openid-configuration` advertises `/oauth2/authorize`,
 * `/oauth2/token`, PKCE `S256`, and public clients with
 * `token_endpoint_auth_method: none`).
 *
 * The API uses that to run the Google sign-in flow itself:
 *
 *   1. The API generates a PKCE pair and stores the verifier server-side.
 *   2. The browser is sent to Neon's `/oauth2/authorize` with `provider=google`.
 *   3. Neon runs the Google consent screen using its own shared OAuth
 *      credentials, then redirects back to the API with an authorization code.
 *   4. The API redeems the code with the PKCE verifier and receives a Neon
 *      session token, which it verifies against Neon's JWKS.
 *
 * The result is that neither the web app nor the mobile app ever talks to
 * Neon or Google directly, and no Google client id is required anywhere.
 */

const GOOGLE_PROVIDER = "google";
const STATE_TTL_SECONDS = 600;

let keySet: ReturnType<typeof createRemoteJWKSet> | null = null;

function getKeySet(): ReturnType<typeof createRemoteJWKSet> {
  keySet ??= createRemoteJWKSet(
    new URL(
      config.NEON_AUTH_JWKS_URL ??
        `${config.NEON_AUTH_BASE_URL?.replace(/\/$/, "")}/.well-known/jwks.json`,
    ),
    { cooldownDuration: 30_000, cacheMaxAge: 60 * 60_000 },
  );
  return keySet;
}

function authBaseUrl(): string {
  const url = config.NEON_AUTH_BASE_URL;
  if (!url) {
    throw new AuthNotConfiguredError(
      "NEON_AUTH_BASE_URL is required for social sign-in",
    );
  }
  return url.replace(/\/$/, "");
}

function clientId(): string {
  const id = config.NEON_AUTH_OAUTH_CLIENT_ID;
  if (!id) {
    throw new AuthNotConfiguredError(
      "NEON_AUTH_OAUTH_CLIENT_ID is required for social sign-in. Register the " +
        "API as an OAuth client of Neon Auth (dynamic client registration is " +
        "available at /oauth2/register).",
    );
  }
  return id;
}

/** The API's own callback. Google/Neon always returns here first. */
export function oauthCallbackUrl(): string {
  return `${config.API_URL.replace(/\/$/, "")}/v1/auth/google/callback`;
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export interface OAuthStart {
  /** Where the browser must be sent to begin the flow. */
  authorizationUrl: string;
  /** Opaque value the API correlates the callback with. */
  state: string;
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
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());

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
    scope: "openid profile email offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    provider: options.provider,
  });

  return {
    authorizationUrl: `${authBaseUrl()}/oauth2/authorize?${params.toString()}`,
    state,
  };
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
export async function claimLinkTicket(ticket: string): Promise<LinkTicket | null> {
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

export interface OAuthIdentity {
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/**
 * Redeems the authorization code and returns the verified identity behind it.
 */
export async function completeOAuthFlow(options: {
  code: string;
  state: string;
}): Promise<{
  identity: OAuthIdentity;
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

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: oauthCallbackUrl(),
    client_id: clientId(),
    code_verifier: stored.code_verifier,
  });
  if (config.NEON_AUTH_OAUTH_CLIENT_SECRET) {
    body.set("client_secret", config.NEON_AUTH_OAUTH_CLIENT_SECRET);
  }

  const response = await fetch(`${authBaseUrl()}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Origin: config.API_URL,
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new AuthProviderError(
      "The sign-in could not be completed",
      "PROVIDER_REJECTED",
      401,
    );
  }

  const idToken =
    typeof payload.id_token === "string"
      ? payload.id_token
      : typeof payload.access_token === "string"
        ? payload.access_token
        : null;

  if (!idToken) {
    throw new AuthProviderError(
      "The sign-in did not return a token",
      "PROVIDER_REJECTED",
      502,
    );
  }

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(idToken, getKeySet(), {
      issuer: authBaseUrl(),
    });
    claims = verified.payload as Record<string, unknown>;
  } catch {
    throw new AuthProviderError(
      "The sign-in token could not be verified",
      "PROVIDER_REJECTED",
      401,
    );
  }

  const subject = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!subject || !email) {
    throw new AuthProviderError(
      "The sign-in did not share an email address",
      "PROVIDER_REJECTED",
      401,
    );
  }

  const emailVerified =
    claims.email_verified === true || claims.email_verified === "true";
  if (!emailVerified) {
    throw new AuthProviderError(
      "The account email address is not verified",
      "GOOGLE_EMAIL_UNVERIFIED",
      403,
    );
  }

  const audience = claims.aud;
  const audiences = Array.isArray(audience)
    ? audience
    : audience
      ? [audience]
      : [];
  if (!audiences.includes(clientId())) {
    throw new AuthProviderError(
      "The sign-in token was issued for another client",
      "PROVIDER_REJECTED",
      401,
    );
  }

  const name =
    typeof claims.name === "string" && claims.name.trim().length > 0
      ? claims.name.trim()
      : email;

  return {
    identity: { subject, email, name, emailVerified },
    appRedirectUri: stored.app_redirect_uri,
    mode: stored.mode,
    userId: stored.user_id,
  };
}

export { GOOGLE_PROVIDER };
