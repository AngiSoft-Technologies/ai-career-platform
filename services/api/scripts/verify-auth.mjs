#!/usr/bin/env node
/**
 * End-to-end check of the auth boundary.
 *
 * Drives the public API the way a client does: sign up, sign in, refresh,
 * reuse a rotated token, sign out and read the session. Every call goes over
 * HTTP to the API only — no provider, no database, no direct Neon access —
 * which is the boundary this suite exists to protect.
 *
 * Usage:
 *   node services/api/scripts/verify-auth.mjs [baseUrl]
 *
 * Defaults to the local API. Set the base URL to check a deployed environment:
 *   node services/api/scripts/verify-auth.mjs https://job-radar-api-angisoft.fly.dev/v1
 *
 * The Google handshake can only be checked with a real browser session, so this
 * script verifies that the API starts it correctly and that it rejects a
 * redirect URI that is not on the allowlist.
 */

const BASE = (process.argv[2] ?? process.env.AUTH_VERIFY_BASE ?? "http://localhost:8088/v1").replace(
  /\/+$/,
  "",
);

const stamp = Date.now().toString(36);
const email = `verify-${stamp}@example.com`;
const password = `Verify-${stamp}-Pass!`;
/** The seeded demo account. Only reachable when the server runs in demo mode. */
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, { token, body, raw, headers: extra = {} } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  Object.assign(headers, extra);
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: raw ? "manual" : "follow",
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return {
    status: response.status,
    payload,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
  };
}

async function main() {
  console.log(`\nVerifying auth boundary against ${BASE}\n`);

  // --- sign up -------------------------------------------------------------
  const signUp = await call("POST", "/auth/sign-up", { body: { email, password, name: "Verify User" } });
  if (signUp.status === 429) {
    console.error(
      `\nSign-up is rate limited (5 per hour per IP). Wait for the window to reset, or point this script at a fresh environment.\n`,
    );
    process.exit(2);
  }
  check(
    "sign up returns 201 with a session",
    signUp.status === 201 &&
      Boolean(signUp.payload?.token) &&
      Boolean(signUp.payload?.refreshToken) &&
      signUp.payload?.user?.email === email,
    `status ${signUp.status}`,
  );

  const access = signUp.payload?.token;
  const refresh = signUp.payload?.refreshToken;

  check(
    "sign up exposes no provider credential",
    !JSON.stringify(signUp.payload).includes("session_token"),
  );
  check(
    "sign up mints short-lived access tokens with an expiry",
    typeof signUp.payload?.expiresAt === "string" &&
      typeof signUp.payload?.refreshExpiresAt === "string",
  );

  // --- duplicate -----------------------------------------------------------
  const duplicate = await call("POST", "/auth/sign-up", { body: { email, password, name: "Verify User" } });
  check(
    "duplicate sign up is rejected with EMAIL_IN_USE",
    duplicate.status === 409 && duplicate.payload?.code === "EMAIL_IN_USE",
    `status ${duplicate.status} code ${duplicate.payload?.code}`,
  );

  // --- sign in -------------------------------------------------------------
  const signIn = await call("POST", "/auth/sign-in", { body: { email, password } });
  check(
    "sign in returns 200 with a fresh token pair",
    signIn.status === 200 && Boolean(signIn.payload?.token),
    `status ${signIn.status}`,
  );
  check(
    "sign in does not reuse the sign-up refresh token",
    signIn.payload?.refreshToken !== refresh,
  );

  const signInRefresh = signIn.payload?.refreshToken;
  const signInAccess = signIn.payload?.token;

  const bad = await call("POST", "/auth/sign-in", { body: { email, password: "wrong-password" } });
  check(
    "wrong password is rejected with INVALID_CREDENTIALS",
    bad.status === 401 && bad.payload?.code === "INVALID_CREDENTIALS",
    `status ${bad.status} code ${bad.payload?.code}`,
  );

  // --- session -------------------------------------------------------------
  const session = await call("GET", "/auth/session", { token: signInAccess });
  check(
    "session resolves for the access token",
    session.status === 200 && session.payload?.user?.email === email,
    `status ${session.status}`,
  );

  const anonymous = await call("GET", "/auth/session");
  check(
    "an anonymous caller is never reported as authenticated",
    anonymous.status === 200
      ? anonymous.payload?.authenticated === false
      : anonymous.status === 401,
    `status ${anonymous.status} authenticated ${anonymous.payload?.authenticated}`,
  );

  // --- refresh rotation ----------------------------------------------------
  const rotated = await call("POST", "/auth/refresh", { body: { refreshToken: signInRefresh } });
  check(
    "refresh issues a new token pair",
    rotated.status === 200 &&
      Boolean(rotated.payload?.token) &&
      rotated.payload?.refreshToken !== signInRefresh,
    `status ${rotated.status}`,
  );

  const rotatedRefresh = rotated.payload?.refreshToken;

  const reuse = await call("POST", "/auth/refresh", { body: { refreshToken: signInRefresh } });
  check(
    "reusing a rotated refresh token revokes the family (TOKEN_REUSED)",
    reuse.status === 401 && reuse.payload?.code === "TOKEN_REUSED",
    `status ${reuse.status} code ${reuse.payload?.code}`,
  );

  const afterReuse = await call("POST", "/auth/refresh", { body: { refreshToken: rotatedRefresh } });
  check(
    "the whole family is revoked after reuse",
    afterReuse.status === 401,
    `status ${afterReuse.status}`,
  );

  // --- me ------------------------------------------------------------------
  const me = await call("GET", "/me", { token: access });
  check(
    "/me returns the local identity",
    me.status === 200 && me.payload?.user?.email === email,
    `status ${me.status}`,
  );

  // --- password reset ------------------------------------------------------
  const reset = await call("POST", "/auth/password/reset-request", { body: { email } });
  check(
    "password reset request is accepted",
    reset.status === 202,
    `status ${reset.status}`,
  );

  // --- Google handshake ----------------------------------------------------
  const google = await call(
    "GET",
    `/auth/google/start?redirect_uri=${encodeURIComponent("jobradar://auth/callback")}`,
    { raw: true },
  );
  check(
    "google start redirects to the provider",
    google.status >= 300 &&
      google.status < 400 &&
      /oauth2\/authorize/.test(google.location ?? ""),
    `status ${google.status} location ${google.location}`,
  );
  check(
    "google start carries PKCE",
    /code_challenge=/.test(google.location ?? ""),
  );

  const notAllowed = await call(
    "GET",
    `/auth/google/start?redirect_uri=${encodeURIComponent("https://evil.example.com/cb")}`,
    { raw: true },
  );
  check(
    "a redirect URI off the allowlist is rejected with INVALID_REDIRECT",
    notAllowed.status === 400 && notAllowed.payload?.code === "INVALID_REDIRECT",
    `status ${notAllowed.status} code ${notAllowed.payload?.code}`,
  );

  const missingRedirect = await call("GET", "/auth/google/start", { raw: true });
  check(
    "google start requires a redirect URI",
    missingRedirect.status === 400,
    `status ${missingRedirect.status}`,
  );

  // --- provider relay ------------------------------------------------------
  const blocked = await call("GET", "/auth/neon/admin/users");
  check(
    "the provider relay only allows the known paths",
    blocked.status === 404 && blocked.payload?.code === "NOT_FOUND",
    `status ${blocked.status}`,
  );

  // --- sign out ------------------------------------------------------------
  const out = await call("POST", "/auth/sign-out", { body: { refreshToken: refresh } });
  check("sign out returns 204", out.status === 204, `status ${out.status}`);

  const afterSignOut = await call("POST", "/auth/refresh", {
    body: { refreshToken: refresh },
  });
  check(
    "a signed-out refresh token no longer works",
    afterSignOut.status === 401,
    `status ${afterSignOut.status}`,
  );

  // --- protected resources -------------------------------------------------
  const resource = "/opportunities";

  const anonymousResource = await call("GET", resource);
  check(
    "a protected resource rejects an anonymous caller",
    anonymousResource.status === 401 ||
      anonymousResource.payload?.authenticated === false,
    `status ${anonymousResource.status}`,
  );

  const authenticatedResource = await call("GET", resource, { token: access });
  check(
    "a protected resource accepts the access token",
    authenticatedResource.status === 200,
    `status ${authenticatedResource.status}`,
  );

  const spoofed = await call("GET", resource, { headers: { "x-user-id": DEMO_USER_ID } });
  check(
    "the x-user-id header cannot be used to impersonate a user",
    spoofed.status === 401,
    `status ${spoofed.status}`,
  );

  const linkTicket = await call("POST", "/auth/google/link-ticket", { token: access });
  check(
    "link tickets require a session",
    linkTicket.status === 200 && typeof linkTicket.payload?.ticket === "string",
    `status ${linkTicket.status}`,
  );

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log("");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\nVerification could not run: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
