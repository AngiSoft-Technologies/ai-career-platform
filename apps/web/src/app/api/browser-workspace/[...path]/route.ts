import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Browser-to-runtime proxy.
 *
 * The browser only ever sends its own API credentials to this same-origin
 * route. We verify them against the API, verify that the named guidance
 * session belongs to that user, and only then talk to the Playwright runtime
 * with the server-side token. Neither the runtime token nor the upload signing
 * secret is ever exposed through NEXT_PUBLIC_* or sent to the client.
 */

const API_ORIGIN = (
  process.env.API_PROXY_TARGET ??
  process.env.NEXT_PUBLIC_API_URL ??
  "https://api.mboqara.angisoft.co.ke/v1"
).replace(/\/+$/, "");

const RUNTIME_ORIGIN = (
  process.env.BROWSER_RUNTIME_URL ?? "http://127.0.0.1:8787"
).replace(/\/+$/, "");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface GuidanceSessionLike {
  id: string;
  applicationId: string;
  status: string;
  targetUrl?: string;
}

type RouteKind = "create" | "frame" | "state" | "command" | "close" | "signed-upload";

interface RoutedRequest {
  kind: RouteKind;
  sessionId?: string;
  documentId?: string;
}

interface Context {
  params: Promise<{ path: string[] }>;
}

function classify(method: string, parts: string[]): RoutedRequest | null {
  if (method === "POST" && parts.length === 1 && parts[0] === "sessions") {
    return { kind: "create" };
  }
  if (parts[0] === "sessions" && parts.length === 3 && method === "GET") {
    if (parts[2] === "frame") return { kind: "frame", sessionId: parts[1] };
    if (parts[2] === "state") return { kind: "state", sessionId: parts[1] };
  }
  if (
    parts[0] === "sessions" &&
    parts.length === 3 &&
    parts[2] === "command" &&
    method === "POST"
  ) {
    return { kind: "command", sessionId: parts[1] };
  }
  if (parts[0] === "sessions" && parts.length === 2 && method === "DELETE") {
    return { kind: "close", sessionId: parts[1] };
  }
  if (parts[0] === "signed-upload" && parts.length === 2 && method === "GET") {
    return { kind: "signed-upload", documentId: parts[1] };
  }
  return null;
}

function error(message: string, status: number, code?: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/** Calls the API with only the caller's own session material. */
async function apiFetch(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", headers.get("accept") ?? "application/json");
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function verifyUser(request: NextRequest): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (!authorization && !cookie) {
    return { ok: false, response: error("Sign in to open the browser workspace", 401) };
  }

  try {
    const response = await apiFetch(request, "/me");
    if (response.status === 401) {
      return { ok: false, response: error("Your session has expired", 401, "UNAUTHORIZED") };
    }
    if (!response.ok) {
      return { ok: false, response: error("Could not verify your account", 502) };
    }
    const payload = (await response.json()) as { user?: { id?: string } };
    if (!payload.user?.id) {
      return { ok: false, response: error("Your account could not be verified", 403) };
    }
    return { ok: true, userId: payload.user.id };
  } catch {
    return { ok: false, response: error("The API is unavailable", 502) };
  }
}

async function authorizeSession(
  request: NextRequest,
  applicationId: string,
  guidanceSessionId: string,
): Promise<
  | { ok: true; session: GuidanceSessionLike }
  | { ok: false; response: NextResponse }
> {
  let response: Response;
  try {
    response = await apiFetch(
      request,
      `/applications/${encodeURIComponent(applicationId)}/guidance/sessions/current`,
    );
  } catch {
    return { ok: false, response: error("The API is unavailable", 502) };
  }
  if (response.status === 404) {
    return { ok: false, response: error("Guidance session not found", 404) };
  }
  if (!response.ok) {
    return { ok: false, response: error("Could not verify this guidance session", 502) };
  }

  const payload = (await response.json().catch(() => null)) as
    | GuidanceSessionLike
    | { session?: GuidanceSessionLike }
    | null;
  const session =
    payload && "session" in payload && payload.session ? payload.session : (payload as GuidanceSessionLike | null);
  if (!session || session.id !== guidanceSessionId || session.applicationId !== applicationId) {
    return { ok: false, response: error("This browser session belongs to another application", 403) };
  }
  if (session.status !== "ACTIVE" && session.status !== "WAITING_FOR_HUMAN") {
    return { ok: false, response: error("This guidance session is no longer active", 409) };
  }
  return { ok: true, session };
}

function sameSite(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

async function forwardRuntime(request: NextRequest, path: string): Promise<NextResponse> {
  const token = process.env.BROWSER_RUNTIME_TOKEN;
  if (!token) return error("Browser runtime is not configured", 503);

  let upstream: Response;
  try {
    const headers = new Headers({
      authorization: `Bearer ${token}`,
      accept: request.headers.get("accept") ?? "application/json",
    });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const body = ["POST", "PUT", "PATCH"].includes(request.method)
      ? await request.arrayBuffer()
      : undefined;
    upstream = await fetch(`${RUNTIME_ORIGIN}${path}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return error("The browser runtime is unavailable", 502);
  }

  const headers = new Headers();
  for (const name of ["content-type", "cache-control", "retry-after", "content-length"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const payload = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new NextResponse(payload, { status: upstream.status, headers });
}

async function isApprovedDocument(
  request: NextRequest,
  applicationId: string,
  documentId: string,
): Promise<boolean> {
  let response: Response;
  try {
    response = await apiFetch(request, `/applications/${encodeURIComponent(applicationId)}/preparation`);
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const payload = (await response.json().catch(() => null)) as
    | { preparation?: {
        status?: string;
        approvedAt?: string;
        documentIds?: Record<string, string | undefined>;
        preparedDocumentIds?: string[];
      } }
    | null;
  const preparation = payload?.preparation;
  if (!preparation || preparation.status !== "READY" || !preparation.approvedAt) return false;
  const approved = new Set<string>(Object.values(preparation.documentIds ?? {}).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  ));
  for (const id of preparation.preparedDocumentIds ?? []) {
    if (typeof id === "string") approved.add(id);
  }
  return approved.has(documentId);
}

async function signedDocumentUrl(
  request: NextRequest,
  applicationId: string,
  documentId: string,
): Promise<NextResponse> {
  const secret = process.env.BROWSER_UPLOAD_SECRET ?? process.env.BROWSER_RUNTIME_TOKEN;
  if (!secret) return error("Upload signing is not configured", 503);
  if (!(await isApprovedDocument(request, applicationId, documentId))) {
    return error("Only an approved document from this application can be uploaded", 403);
  }

  let response: Response;
  try {
    response = await apiFetch(request, `/documents/${encodeURIComponent(documentId)}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "pdf" }),
    });
  } catch {
    return error("The API is unavailable", 502);
  }
  if (!response.ok) {
    return error("That approved document could not be exported", 502);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return error("The exported document was not a usable PDF", 502);
  }

  const payload = bytes.toString("base64");
  const expires = Date.now() + 5 * 60 * 1000;
  const signature = createHmac("sha256", secret)
    .update(`${documentId}.${expires}.${payload}`)
    .digest("hex");
  return NextResponse.json({
    url: `data:application/pdf;base64,${payload}#mboqara=${documentId}.${expires}.${signature}`,
    filename: `${documentId}.pdf`,
    expiresAt: new Date(expires).toISOString(),
  });
}

async function handle(request: NextRequest, context: Context): Promise<NextResponse> {
  const { path: parts } = await context.params;
  const routed = classify(request.method, parts);
  if (!routed) return error("Unknown browser workspace route", 404);

  const runtimeToken = process.env.BROWSER_RUNTIME_TOKEN;
  if (!runtimeToken) return error("Browser runtime is not configured", 503);

  const user = await verifyUser(request);
  if (!user.ok) return user.response;

  const applicationId = request.headers.get("x-application-id") ?? "";
  const guidanceSessionId = request.headers.get("x-guidance-session-id") ?? "";
  if (!UUID.test(applicationId) || !UUID.test(guidanceSessionId)) {
    return error("A valid application and guidance session are required", 400);
  }
  const sessionCheck = await authorizeSession(request, applicationId, guidanceSessionId);
  if (!sessionCheck.ok) return sessionCheck.response;

  if (routed.sessionId && routed.sessionId !== guidanceSessionId) {
    return error("This browser session does not match your guidance session", 403);
  }

  if (routed.kind === "signed-upload") {
    if (!routed.documentId || !UUID.test(routed.documentId)) {
      return error("A valid document id is required", 400);
    }
    return signedDocumentUrl(request, applicationId, routed.documentId);
  }

  if (routed.kind === "create") {
    let body: { targetUrl?: unknown };
    try {
      body = (await request.json()) as { targetUrl?: unknown };
    } catch {
      return error("Invalid request body", 400);
    }
    if (typeof body.targetUrl !== "string" || !sameSite(body.targetUrl, sessionCheck.session.targetUrl ?? "")) {
      return error("That URL is not the target of your guidance session", 403);
    }
    const forwarded = JSON.stringify({
      applicationId,
      guidanceSessionId,
      targetUrl: body.targetUrl,
      token: runtimeToken,
    });
    const upstream = await fetch(`${RUNTIME_ORIGIN}/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtimeToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: forwarded,
      cache: "no-store",
    }).catch(() => null);
    if (!upstream) return error("The browser runtime is unavailable", 502);
    if (!upstream.ok) {
      const payload = (await upstream.json().catch(() => null)) as { error?: string } | null;
      return error(payload?.error ?? "The browser session could not start", upstream.status);
    }
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  }

  const runtimePath =
    routed.kind === "close"
      ? `/sessions/${encodeURIComponent(guidanceSessionId)}`
      : `/sessions/${encodeURIComponent(guidanceSessionId)}/${routed.kind === "command" ? "command" : routed.kind}`;
  return forwardRuntime(request, runtimePath);
}

export async function GET(request: NextRequest, context: Context) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: Context) {
  return handle(request, context);
}

export async function DELETE(request: NextRequest, context: Context) {
  return handle(request, context);
}
