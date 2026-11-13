import { NextResponse, type NextRequest } from "next/server";

import {
  CHALLENGE_COOKIE_NAMES,
  hasCookie,
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

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "https://mboqara-api-angisoft.fly.dev/v1"
).replace(/\/$/, "");

export async function proxy(request: NextRequest) {
  const verifier = request.nextUrl.searchParams.get(VERIFIER_PARAM);
  if (!verifier) return NextResponse.next();

  const cookieHeader = request.headers.get("cookie");
  // The challenge is what makes the exchange possible. Without it there is
  // nothing to exchange, and the page should say so rather than spin.
  if (!cookieHeader || !hasCookie(cookieHeader, CHALLENGE_COOKIE_NAMES)) {
    console.warn("[oauth] the verifier arrived without its challenge cookie");
    return fail(request, "STATE_MISMATCH");
  }

  const origin = request.nextUrl.origin;
  // The query has to go with it. The provider's exchange reads the verifier
  // from the query, and it is the whole point of the request — without it
  // the provider has nothing to exchange and answers 400.
  const upstream = await fetch(
    `${API_URL}/auth/neon/get-session${request.nextUrl.search}`,
    {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        origin,
        accept: "application/json",
      },
      cache: "no-store",
    },
  ).catch(() => null);

  if (!upstream) {
    console.warn("[oauth] the verifier exchange could not reach the provider");
    return fail(request, "PROVIDER_UNREACHABLE");
  }

  if (!upstream.ok) {
    // The provider says what it refused. "Verification not found" means the
    // verifier was spent or never existed; "Session challenge cookie not
    // found" means the browser did not bring the challenge back.
    const payload = (await upstream.json().catch(() => null)) as {
      code?: string;
    } | null;
    const code =
      payload?.code === "SESSION_CHALLENGE_COOKIE_NOT_FOUND"
        ? "STATE_MISMATCH"
        : "PROVIDER_REJECTED";
    console.warn(
      `[oauth] the verifier exchange was refused: ${upstream.status} ${payload?.code ?? ""}`.trim(),
    );
    return fail(request, code);
  }

  const secureContext =
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:";

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
    `mboqara.oauth.pending=; Path=/; Max-Age=0; SameSite=None${
      secureContext ? "; Secure" : ""
    }`,
  );
  return response;
}

/**
 * Ends a sign-in that cannot be completed, with a reason.
 *
 * The verifier is removed either way: it is spent, and the page would
 * otherwise build its authorization request out of a query that includes it.
 */
function fail(request: NextRequest, code: string): NextResponse {
  const url = request.nextUrl.clone();
  url.searchParams.delete(VERIFIER_PARAM);
  url.searchParams.set("google_error", code);
  if (url.pathname !== "/login") url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand|media|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|avif|mp4|ico|txt)$).*)",
  ],
};
