/**
 * Cookie handling for the provider relay.
 *
 * The provider is on another host, so its cookies arrive with attributes
 * meant for that host: a `Domain` naming it, and a `SameSite` policy that
 * assumes it is first-party there. A browser rejects a cookie whose domain
 * does not match the host that set it, so the domain has to go. What is left
 * has to be rewritten so the cookie is first-party on this origin — that is
 * the whole point of the relay.
 *
 * These are pure functions so both the route handler and the middleware can
 * use them.
 */

/**
 * Cookies the provider marks with the `__Secure-` prefix can only be set
 * over https, so over plain http the prefix is dropped on the way out and
 * restored on the way back.
 */
const SECURE_PREFIXED_COOKIES = new Map([
  ["__Secure-neon-auth.session_token", "neon-auth.session_token"],
]);

export function browserCookieName(
  upstreamName: string,
  secureContext: boolean,
): string {
  if (secureContext) return upstreamName;
  return SECURE_PREFIXED_COOKIES.get(upstreamName) ?? upstreamName;
}

export function upstreamCookieName(
  browserName: string,
  secureContext: boolean,
): string {
  if (secureContext) return browserName;
  for (const [upstream, browser] of SECURE_PREFIXED_COOKIES) {
    if (browser === browserName) return upstream;
  }
  return browserName;
}

export function toUpstreamCookieHeader(
  cookieHeader: string,
  secureContext: boolean,
): string {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return part;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1);
      return `${upstreamCookieName(name, secureContext)}=${value}`;
    })
    .join("; ");
}

/**
 * Cookies that have to survive the trip back from the provider.
 *
 * The browser comes back from Google on a cross-site navigation, and the
 * challenge cookie is what makes the exchange possible. A cookie marked
 * "Lax" is withheld on some of those navigations, which leaves the exchange
 * with nothing to work from and the person signed out with no sign of it.
 * "None" is sent on every request, and browsers only accept it alongside
 * "Secure" — which this origin has.
 */
const CROSS_SITE_COOKIES = ["session_challeng"];

function travelsCrossSite(name: string): boolean {
  return CROSS_SITE_COOKIES.some((marker) => name.includes(marker));
}

/**
 * Rewrites a provider cookie so the browser will keep it here.
 *
 * `Domain` is dropped (the browser would refuse it otherwise), `SameSite`
 * is set so the cookie rides along on the navigation that comes back from
 * the provider, and `Secure` is added wherever the context allows it.
 */
export function normalizeSetCookie(
  value: string,
  secureContext: boolean,
): string {
  const parts = value.split(";");
  const rawNameValue = parts[0] ?? "";
  const separator = rawNameValue.indexOf("=");
  const upstreamName =
    separator < 0 ? rawNameValue.trim() : rawNameValue.slice(0, separator).trim();
  const cookieValue =
    separator < 0 ? "" : rawNameValue.slice(separator + 1).trim();

  const attributes = parts
    .slice(1)
    .map((part) => part.trim())
    .filter((part) => {
      const lower = part.toLowerCase();
      if (lower.startsWith("partitioned")) return false;
      if (lower.startsWith("samesite=")) return false;
      // The provider cookie has to become a host-only cookie for this origin.
      // A Domain attribute for the provider's own domain would be rejected by
      // the browser and the session would be lost.
      if (lower.startsWith("domain=")) return false;
      if (lower.startsWith("secure") && !secureContext) return false;
      return true;
    });

  const alreadySecure = attributes.some(
    (attribute) => attribute.toLowerCase() === "secure",
  );
  if (secureContext && !alreadySecure) attributes.push("Secure");

  attributes.push(
    secureContext && travelsCrossSite(upstreamName)
      ? "SameSite=None"
      : "SameSite=Lax",
  );

  const browserName = browserCookieName(upstreamName, secureContext);
  if (!browserName) return "";

  return `${browserName}=${cookieValue}; ${attributes.join("; ")}`;
}

/**
 * The pending authorization request, kept where the middleware can read it.
 *
 * The provider sends the browser back to this origin with a one-time
 * verifier. The middleware exchanges that verifier for the session, and the
 * browser has to end up on the sign-in page holding the *original* signed
 * request, because that request is what the provider resumes. The browser's
 * own storage is not readable from the middleware, so the request is kept
 * in a cookie.
 */
export const PENDING_OAUTH_COOKIE = "mboqara.oauth.pending";

export function readPendingOAuthCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== PENDING_OAUTH_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
