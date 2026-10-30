import { config } from "../../config.js";

/**
 * The API is the only party that talks to Neon Auth.
 *
 * Neon Auth is an OAuth 2.1 authorization server (it publishes
 * `/.well-known/openid-configuration` with `/oauth2/authorize`, `/oauth2/token`
 * and PKCE `S256`). The API runs the social sign-in flow as an OAuth client
 * with PKCE, which means the browser only ever performs navigation hops:
 *
 *   API  -> Neon /oauth2/authorize  -> login page (signed authorization request)
 *   login page -> API -> Neon /sign-in/social -> Google
 *   Google -> Neon /callback/google -> login page (now with a Neon session)
 *   login page -> API -> Neon /oauth2/continue -> API callback with the code
 *   API -> Neon /oauth2/token (code + PKCE verifier) -> identity -> app tokens
 *
 * The two Neon calls in the middle have to happen from the browser's session
 * because Neon stores the social sign-in state behind its own session cookie.
 * The API exposes them as a narrow relay so the web and mobile apps never
 * address Neon directly and never hold a provider credential.
 *
 * Only the paths below are reachable. Everything else is rejected.
 */
const ALLOWED_PATHS = new Set([
  "sign-in/social",
  "oauth2/continue",
  "oauth2/consent",
  "oauth2/public-client",
  "get-session",
  "token",
  "sign-out",
  "list-accounts",
]);

export function isAllowedNeonPath(path: string): boolean {
  return ALLOWED_PATHS.has(path.replace(/^\/+|\/+$/g, ""));
}

export interface NeonRelayResult {
  status: number;
  headers: Headers;
  body: ArrayBuffer;
}

/**
 * Forwards a request to Neon Auth.
 *
 * The session cookie is passed through untouched in both directions. The
 * caller decides which cookie jar to use: the web app keeps the cookie on its
 * own origin (so it stays a first-party cookie) and relays it here.
 */
export async function relayToNeon(
  path: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
): Promise<NeonRelayResult> {
  const base = config.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("NEON_AUTH_BASE_URL is not configured");
  }

  const headers = new Headers(init.headers);
  headers.set("accept", headers.get("accept") ?? "application/json");

  const response = await fetch(`${base}/${path.replace(/^\/+/, "")}`, {
    method: init.method,
    headers,
    body: init.body,
    redirect: "manual",
    cache: "no-store",
  });

  const outHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) outHeaders.set("content-type", contentType);
  outHeaders.set("cache-control", "no-store");
  for (const cookie of response.headers.getSetCookie()) {
    outHeaders.append("set-cookie", cookie);
  }

  return {
    status: response.status,
    headers: outHeaders,
    body: await response.arrayBuffer(),
  };
}
