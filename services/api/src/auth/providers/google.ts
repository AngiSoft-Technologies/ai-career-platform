import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../../config.js";
import { AuthNotConfiguredError } from "../tokens.js";
import { AuthProviderError } from "./errors.js";

const GOOGLE_CERTS = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let keySet: ReturnType<typeof createRemoteJWKSet> | null = null;

function getKeySet(): ReturnType<typeof createRemoteJWKSet> {
  keySet ??= createRemoteJWKSet(GOOGLE_CERTS, {
    cooldownDuration: 30_000,
    cacheMaxAge: 60 * 60_000,
  });
  return keySet;
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/**
 * Verifies a native Google ID token issued to the mobile app.
 *
 * The audience is the *web* OAuth client ID because Android and iOS request an
 * ID token against the server client (see the google_sign_in setup guide). The
 * token never leaves the backend after this call.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  nonce?: string,
): Promise<GoogleIdentity> {
  const audience = config.GOOGLE_WEB_CLIENT_ID;
  if (!audience) {
    throw new AuthNotConfiguredError(
      "GOOGLE_WEB_CLIENT_ID is required for Google sign-in",
    );
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(idToken, getKeySet(), {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new AuthProviderError(
      "Google sign-in token could not be verified",
      "PROVIDER_REJECTED",
      401,
    );
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new AuthProviderError(
      "Google sign-in token is missing a subject",
      "PROVIDER_REJECTED",
      401,
    );
  }

  if (typeof payload.email !== "string" || payload.email.length === 0) {
    throw new AuthProviderError(
      "Google account did not share an email address",
      "PROVIDER_REJECTED",
      401,
    );
  }

  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  if (!emailVerified) {
    throw new AuthProviderError(
      "Google account email is not verified",
      "GOOGLE_EMAIL_UNVERIFIED",
      403,
    );
  }

  if (nonce && payload.nonce !== nonce) {
    throw new AuthProviderError(
      "Google sign-in token does not match this request",
      "PROVIDER_REJECTED",
      401,
    );
  }

  const name =
    typeof payload.name === "string" && payload.name.trim().length > 0
      ? payload.name.trim()
      : payload.email;

  return {
    subject: payload.sub,
    email: payload.email,
    name,
    emailVerified,
  };
}
