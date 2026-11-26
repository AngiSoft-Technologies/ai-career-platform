"use client";

import { cachedSession, cachedToken, clearToken, getToken } from "@/lib/auth";
import type {
  BrowserCommand,
  BrowserSessionInfo,
  BrowserState,
  WorkspaceContext,
} from "./types";

const BASE = "/api/browser-workspace";

export class WorkspaceError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "WorkspaceError";
    this.status = status;
    this.code = code;
  }
}

function sessionHeaders(context: WorkspaceContext, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("x-application-id", context.applicationId);
  headers.set("x-guidance-session-id", context.guidanceSessionId);
  return headers;
}

async function authedFetch(
  path: string,
  init: RequestInit,
  context: WorkspaceContext,
  retry = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = cachedToken() ?? (cachedSession() ? await getToken() : null);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (context) {
    headers.set("x-application-id", context.applicationId);
    headers.set("x-guidance-session-id", context.guidanceSessionId);
  }

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retry && (token || cachedSession())) {
    clearToken();
    const fresh = await getToken();
    if (fresh) return authedFetch(path, init, context, false);
  }
  return response;
}

async function json<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!response.ok) {
    throw new WorkspaceError(
      payload?.error ?? `Request failed with ${response.status}`,
      response.status,
      payload?.code,
    );
  }
  return payload as T;
}

export function createBrowserSession(
  context: WorkspaceContext,
  targetUrl: string,
): Promise<BrowserSessionInfo> {
  return authedFetch(
    "/sessions",
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ targetUrl }),
    },
    context,
  ).then((response) => json<BrowserSessionInfo>(response));
}

export function getBrowserState(context: WorkspaceContext): Promise<BrowserState> {
  return authedFetch(
    `/sessions/${encodeURIComponent(context.guidanceSessionId)}/state`,
    { method: "GET", headers: { accept: "application/json" }, cache: "no-store" },
    context,
  ).then((response) => json<BrowserState>(response));
}

export async function fetchFrame(
  context: WorkspaceContext,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await authedFetch(
    `/sessions/${encodeURIComponent(context.guidanceSessionId)}/frame`,
    { method: "GET", headers: { accept: "image/jpeg" }, cache: "no-store", signal },
    context,
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new WorkspaceError(
      payload?.error ?? `Frame request failed with ${response.status}`,
      response.status,
    );
  }
  return response.blob();
}

export async function sendBrowserCommand(
  context: WorkspaceContext,
  command: BrowserCommand,
): Promise<Record<string, unknown>> {
  const response = await authedFetch(
    `/sessions/${encodeURIComponent(context.guidanceSessionId)}/command`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(command),
    },
    context,
  );
  const payload = await json<{ ok: boolean; result?: Record<string, unknown> }>(response);
  return payload.result ?? {};
}

export async function deleteBrowserSession(context: WorkspaceContext): Promise<void> {
  const response = await authedFetch(
    `/sessions/${encodeURIComponent(context.guidanceSessionId)}`,
    { method: "DELETE", headers: { accept: "application/json" } },
    context,
  );
  if (!response.ok && response.status !== 404) {
    await json(response);
  }
}

export interface SignedUpload {
  url: string;
  filename: string;
  expiresAt: string;
}

export function getSignedUploadUrl(
  context: WorkspaceContext,
  documentId: string,
): Promise<SignedUpload> {
  return authedFetch(
    `/signed-upload/${encodeURIComponent(documentId)}`,
    { method: "GET", headers: { accept: "application/json" }, cache: "no-store" },
    context,
  ).then((response) => json<SignedUpload>(response));
}

export { sessionHeaders };
