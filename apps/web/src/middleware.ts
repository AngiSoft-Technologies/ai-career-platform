import { NextResponse, type NextRequest } from "next/server";

import {
  normalizeSetCookie,
  readPendingOAuthCookie,
} from "@/lib/auth-cookies";

/**
 * Completes the provider's sign-in.
 *
 * The provider is an authorization server that runs its own sign-in: the
 * browser goes to it, the person chooses an account, and the provider comes
 * back to *this* origin with a one-time verifier instead of a session. The
 * verifier is only half the answer — it has to be exchanged for the session,
 * and the exchange is what proves the challenge cookie that was set when
 * the sign-in started.
 *
 * Without that exchange the browser lands here with a verifier in the
 * address bar and no session at all: the sign-in is over, the person is
 * still signed out, and nothing says why.
 *
 * The exchange happens here, before the page renders, because the session
 * cookie has to be set on the response that carries the browser back.
 */

/** The parameter the provider uses to hand the verifier over. */
const VERIFIER_PARAM = "neon_auth_session_verifier";

/** The cookie that ties the verifier to the browser that started the flow. */
const CHALLENGE_COOKIE = "session_challeng";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "https://mboqara-api-angisoft.fly.dev/v1"
).replace(/\/$/, "");

export async function middleware(request: NextRequest) {
  const verifier = request.nextUrl.searchParams.get(VERIFIER_PARAM);
  if (!verifier) return NextResponse.next();

  const cookieHeader = request.headers.get("cookie");
  // The challenge is what makes the exchange possible. Without it there is
  // nothing to exchange, and the page should say so rather than spin.
  if (!cookieHeader || !cookieHeader.includes(CHALLENGE_COOKIE)) {
    return NextResponse.next();
  }

  const origin = request.nextUrl.origin;
  const upstream = await fetch(`${API_URL}/auth/neon/get-session`, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
      origin,
      accept: "application/json",
    },
    cache: "no-store",
  }).catch(() => null);

  if (!upstream || !upstream.ok) return NextResponse.next();

  const secureContext = origin.startsWith("https://");
  const url = request.nextUrl.clone();
  url.searchParams.delete(VERIFIER_PARAM);

  // The provider may have sent the browser back to the root of the site
  // rather than to the sign-in page. The signed authorization request is
  // what the provider resumes, and it is kept in a cookie, so the browser
  // can be sent to the sign-in page carrying it.
  const pending = readPendingOAuthCookie(cookieHeader);
  if (pending && !url.searchParams.get("sig")) {
    url.pathname = "/login";
    url.search = pending;
  }

  const response = NextResponse.redirect(url);
  for (const value of upstream.headers.getSetCookie()) {
    const normalized = normalizeSetCookie(value, secureContext);
    if (normalized) response.headers.append("set-cookie", normalized);
  }
  // The pending request has done its job once it has been handed over.
  response.headers.append(
    "set-cookie",
    `${"mboqara.oauth.pending"}=; Path=/; Max-Age=0; SameSite=Lax${secureContext ? "; Secure" : ""}`,
  );
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand|media|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|avif|mp4|ico|txt)$).*)",
  ],
};
