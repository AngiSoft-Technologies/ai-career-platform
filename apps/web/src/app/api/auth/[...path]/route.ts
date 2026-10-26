import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  process.env.NEON_AUTH_URL ??
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ??
  "https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth";

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
      if (lower.startsWith("secure") && !secureContext) return false;
      return true;
    });

  attributes.push(secureContext ? "SameSite=None; Secure" : "SameSite=Lax");

  return `${browserCookieName(upstreamName, secureContext)}=${cookieValue}; ${attributes.join("; ")}`;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const upstreamUrl = new URL(`${UPSTREAM}/${path.join("/")}`);

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
    if (value) {
      responseHeaders.append("set-cookie", normalizeSetCookie(value, secureContext));
    }
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
