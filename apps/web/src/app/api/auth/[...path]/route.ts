import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin relay for the identity provider.
 *
 * The API is the only party that talks to the provider. This route exists for
 * one reason: the provider session has to stay a first-party cookie on this
 * origin, because two steps of the OAuth authorization flow have to run inside
 * the session the provider created. The request is forwarded to the API, which
 * forwards it to the provider and returns the response untouched.
 */
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "https://job-radar-api-angisoft.fly.dev/v1"
).replace(/\/$/, "");

export const dynamic = "force-dynamic";

/**
 * Cookies the upstream marks with the `__Secure-` prefix are only accepted by
 * browsers when they also carry `Secure`, which rules them out over plain
 * http. The proxy therefore renames them for insecure contexts and maps them
 * back when talking to the upstream.
 */
const SECURE_PREFIXED_COOKIES = new Map([
  ["__Secure-neon-auth.session_token", "neon-auth.session_token"],
]);

function browserCookieName(upstreamName: string, secureContext: boolean): string {
  if (secureContext) return upstreamName;
  return SECURE_PREFIXED_COOKIES.get(upstreamName) ?? upstreamName;
}

function upstreamCookieName(browserName: string, secureContext: boolean): string {
  if (secureContext) return browserName;
  for (const [upstream, browser] of SECURE_PREFIXED_COOKIES) {
    if (browser === browserName) return upstream;
  }
  return browserName;
}

function toUpstreamCookieHeader(cookieHeader: string, secureContext: boolean): string {
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

function normalizeSetCookie(value: string, secureContext: boolean): string {
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

  attributes.push("SameSite=Lax");

  const browserName = browserCookieName(upstreamName, secureContext);
  if (!browserName) return "";

  return `${browserName}=${cookieValue}; ${attributes.join("; ")}`;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const upstreamUrl = new URL(`${API_URL}/auth/neon/${path.join("/")}`);

  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const secureContext =
    forwardedProto === "https" || request.nextUrl.protocol === "https:";

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", toUpstreamCookieHeader(cookie, secureContext));
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const origin = request.headers.get("origin");
  if (origin) headers.set("origin", origin);
  headers.set("accept", request.headers.get("accept") ?? "application/json");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { message: "Auth service unreachable", code: "AUTH_UPSTREAM_UNREACHABLE" },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const setCookies =
    upstream.headers.getSetCookie?.() ?? upstream.headers.get("set-cookie") ?? [];
  for (const value of Array.isArray(setCookies) ? setCookies : [setCookies]) {
    if (!value) continue;
    const normalized = normalizeSetCookie(value, secureContext);
    if (normalized) responseHeaders.append("set-cookie", normalized);
  }
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("content-type", upstreamType);
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return proxy(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return proxy(request, context);
}
