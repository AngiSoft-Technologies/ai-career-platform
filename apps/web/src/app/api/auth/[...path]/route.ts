import { NextRequest, NextResponse } from "next/server";

import {
  normalizeSetCookie,
  toUpstreamCookieHeader,
} from "@/lib/auth-cookies";

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
  process.env.NEXT_PUBLIC_API_URL ?? "https://mboqara-api-angisoft.fly.dev/v1"
).replace(/\/$/, "");

export const dynamic = "force-dynamic";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  // The API mounts at /v1/auth/neon/*, so we strip the leading "neon" from the path
  const neonPath = path[0] === "neon" ? path.slice(1) : path;
  const upstreamUrl = new URL(`${API_URL}/auth/neon/${neonPath.join("/")}`);

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

  // A redirect through the relay has to keep its destination, or the
  // browser lands on a 302 with nowhere to go. The provider's own
  // redirects (to Google, and back to this origin) are part of the flow.
  const location = upstream.headers.get("location");
  if (location) responseHeaders.set("location", location);

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
