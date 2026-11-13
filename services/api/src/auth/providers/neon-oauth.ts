import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../../config.js";
import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { AuthNotConfiguredError } from "../tokens.js";
import { AuthProviderError } from "./errors.js";

/**
 * Neon Auth is an OAuth 2.1 authorization server in its own right
 * (`/.well-known/openid-configuration` advertises `/oauth2/authorize`,
 * `/oauth2/token`, PKCE `S256`), and the API is registered on it as an
 * OAuth *client*. The Google sign-in runs as an authorization request
 * against that server:
 *
 *   1. The API generates a PKCE pair and stores the verifier server-side.
 *   2. The browser is sent to Neon's `/oauth2/authorize` with the API's
 *      own `client_id` and `provider=google`.
 *   3. Neon sends the browser to the application's login page, which
 *      signs the user in through Neon Auth; Neon then shows Google the
 *      consent screen using the credentials *Neon Auth* holds for the
 *      Google provider, and returns the browser to the API's callback
 *      with an authorization code.
 *   4. The API redeems the code with the PKCE verifier and its own
 *      client credentials, and receives a Neon session token, which it
 *      verifies against Neon's JWKS.
 *
 * The result is that neither the web app nor the mobile app ever talks to
 * Neon or Google directly, and no Google client id is required anywhere
 * in this codebase.
 *
 * The `client_id` on the authorize request is the API's own — the client
 * registered on Neon Auth's OAuth server. It is *not* the client id Neon
 * Auth uses to talk to Google: sending that one answers `invalid_client`
 * ("client not found") from a server that has never heard of it. Google's
 * credentials belong to the provider, and Neon already holds them.
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

/**
 * The protected resource this API is registered as, on Neon Auth.
 *
 * Neon's OAuth server links a client to one or more protected resources and
 * binds the authorization code to the resource named on the *authorize*
 * request. The same `resource` has to be sent again when the code is redeemed;
 * without it the exchange is answered `invalid_grant` and the visitor is sent
 * back to sign in — which reads as an endless loop.
 *
 * A single helper keeps the two requests from ever drifting apart.
 */
export function oauthResource(): string {
  return config.API_URL.replace(/\/$/, "");
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
    // Built-in authorization servers bind the code to the resource named
    // here; see oauthResource(). Omitting it makes every redemption fail.
    resource: oauthResource(),
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
 * Reads the signed-in account from the provider's userinfo endpoint.
 *
 * Neon's ID token has no `name` and no `email`; the access token is what
 * unlocks them. A failure here is not fatal — the caller falls back to the
 * token claims — so it returns null instead of throwing.
 */
async function fetchUserInfo(
  accessToken: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${authBaseUrl()}/oauth2/userinfo`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      logger.warn(
        { event: "oauth.userinfo.failed", status: response.status },
        "Neon Auth userinfo request failed",
      );
      return null;
    }
    return (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
  } catch (error) {
    logger.warn(
      {
        event: "oauth.userinfo.error",
        error: error instanceof Error ? error.message : String(error),
      },
      "Neon Auth userinfo request errored",
    );
    return null;
  }
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

  // A confidential client proves who it is at the token endpoint with
  // HTTP Basic, and the API's client is registered for exactly that
  // (`token_endpoint_auth_method: client_secret_basic`). Sending the
  // secret in the body instead is answered with "client registered for
  // client_secret_basic cannot use client_secret_post", and sending no
  // secret at all with "cannot use none".
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    Origin: config.API_URL,
  };
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: oauthCallbackUrl(),
    client_id: clientId(),
    code_verifier: stored.code_verifier,
    // Must match the resource sent to /oauth2/authorize, or the code was
    // issued for a resource this redemption does not name and is refused.
    resource: oauthResource(),
  });
  if (config.NEON_AUTH_OAUTH_CLIENT_SECRET) {
    const credentials = Buffer.from(
      `${clientId()}:${config.NEON_AUTH_OAUTH_CLIENT_SECRET}`,
    ).toString("base64");
    headers.authorization = `Basic ${credentials}`;
  }

  const response = await fetch(`${authBaseUrl()}/oauth2/token`, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    // The provider's own explanation is the only thing that makes a failed
    // exchange debuggable; without it every rejection looks identical.
    const description =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : `HTTP ${response.status}`;
    logger.warn(
      {
        event: "oauth.token.rejected",
        status: response.status,
        error: payload.error ?? null,
        errorDescription: payload.error_description ?? null,
        resource: oauthResource(),
      },
      "Neon Auth rejected the authorization code",
    );
    throw new AuthProviderError(
      `The sign-in could not be completed (${description})`,
      "PROVIDER_REJECTED",
      401,
    );
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : null;
  const idToken =
    typeof payload.id_token === "string" ? payload.id_token : null;

  if (!accessToken && !idToken) {
    throw new AuthProviderError(
      "The sign-in did not return a token",
      "PROVIDER_REJECTED",
      502,
    );
  }

  let claims: Record<string, unknown> = {};
  if (idToken) {
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
  }

  // Neon's ID token carries neither the name nor the email address — its
  // userinfo endpoint is the documented source for both. Merge rather than
  // replace, so a field the userinfo response omits is still taken from the
  // verified token.
  const profile = accessToken ? await fetchUserInfo(accessToken) : null;
  const identityClaims: Record<string, unknown> = { ...claims };
  if (profile) {
    for (const [field, value] of Object.entries(profile)) {
      if (value !== undefined && value !== null) identityClaims[field] = value;
    }
  }

  const subject =
    typeof identityClaims.sub === "string" ? identityClaims.sub : "";
  const email =
    typeof identityClaims.email === "string" ? identityClaims.email : "";
  if (!subject || !email) {
    throw new AuthProviderError(
      "The sign-in did not share an email address",
      "PROVIDER_REJECTED",
      401,
    );
  }

  const emailVerified =
    identityClaims.email_verified === true ||
    identityClaims.email_verified === "true";
  if (!emailVerified) {
    throw new AuthProviderError(
      "The account email address is not verified",
      "GOOGLE_EMAIL_UNVERIFIED",
      403,
    );
  }

  const name =
    typeof identityClaims.name === "string" &&
    identityClaims.name.trim().length > 0
      ? identityClaims.name.trim()
      : email;

  return {
    identity: { subject, email, name, emailVerified },
    appRedirectUri: stored.app_redirect_uri,
    mode: stored.mode,
    userId: stored.user_id,
  };
}

export { GOOGLE_PROVIDER };
