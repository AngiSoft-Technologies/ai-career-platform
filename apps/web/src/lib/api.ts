"use client";

import { API_URL, cachedSession, cachedToken, clearToken, getToken } from "./auth";

export interface ApiError {
  error: string;
  code?: string;
  status: number;
  details?: unknown;
}

export class ApiRequestError extends Error implements ApiError {
  error: string;
  status: number;
  code?: string;
  details?: unknown;

  constructor(payload: ApiError) {
    super(payload.error || "Request failed");
    this.name = "ApiRequestError";
    this.error = payload.error || "Request failed";
    this.status = payload.status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

const CACHE_PREFIX = "jr.cache:";
const OUTBOX_KEY = "jr.outbox";

/** Cached reads older than this are ignored rather than shown as current. */
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cache and outbox entries are namespaced by account.
 *
 * Without this, a second user signing in on the same browser inherits the
 * first user's cached responses — and worse, their queued writes would be
 * replayed under the new session.
 */
function namespace(): string {
  return cachedSession()?.user.id ?? "anonymous";
}

export interface OutboxItem {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

function readOutbox(): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${OUTBOX_KEY}:${namespace()}`);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${OUTBOX_KEY}:${namespace()}`,
    JSON.stringify(items),
  );
}

export function outboxSize(): number {
  return readOutbox().length;
}

export function outboxItems(): OutboxItem[] {
  return readOutbox();
}

export function clearOutbox(): void {
  writeOutbox([]);
}

function cacheKey(path: string): string {
  return `${CACHE_PREFIX}${namespace()}:${path}`;
}

export function readCache<T>(path: string): { data: T; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(path));
    if (!raw) return null;
    return JSON.parse(raw) as { data: T; at: number };
  } catch {
    return null;
  }
}

export function writeCache(path: string, data: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      cacheKey(path),
      JSON.stringify({ data, at: Date.now() }),
    );
  } catch {
    return;
  }
}

export function isOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  cache?: boolean;
  queueWhenOffline?: boolean;
  signal?: AbortSignal;
  /**
   * Set to false to stop the client from clearing an expired token and
   * retrying the request once with a freshly minted one.
   */
  retryOnUnauthorized?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = path.startsWith("http") ? path : `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

async function authHeaders(): Promise<Record<string, string>> {
  const cached = cachedToken();
  const token = cached ?? (cachedSession() ? await getToken() : null);
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const url = buildUrl(path, options.query);

  if (isOffline() && method !== "GET" && options.queueWhenOffline !== false) {
    const items = readOutbox();
    items.push({
      id: crypto.randomUUID(),
      method,
      path: url.startsWith(API_URL) ? url.slice(API_URL.length) : url,
      body: options.body,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    writeOutbox(items);
    throw new ApiRequestError({
      error: "You are offline. This change is queued and will sync when you reconnect.",
      code: "OFFLINE_QUEUED",
      status: 0,
    });
  }

  const headers = await authHeaders();
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (method === "GET" && options.cache !== false) {
      const cached = readCache<T>(path);
      if (cached && Date.now() - cached.at <= MAX_CACHE_AGE_MS) {
        return cached.data;
      }
    }
    throw new ApiRequestError({
      error: error instanceof Error ? error.message : "Network request failed",
      code: "NETWORK_ERROR",
      status: 0,
    });
  }

  if (
    response.status === 401 &&
    options.retryOnUnauthorized !== false &&
    (headers.authorization || cachedSession())
  ) {
    clearToken();
    const fresh = await getToken();
    if (fresh) {
      const retryHeaders: Record<string, string> = { accept: "application/json" };
      retryHeaders.authorization = `Bearer ${fresh}`;
      if (options.body !== undefined) retryHeaders["Content-Type"] = "application/json";
      try {
        const retried = await fetch(url, {
          method,
          headers: retryHeaders,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: options.signal,
        });
        if (retried.ok) {
          const contentType = retried.headers.get("content-type") ?? "";
          if (!contentType.includes("application/json")) return undefined as T;
          const data = (await retried.json()) as T;
          if (method === "GET" && options.cache !== false) writeCache(path, data);
          return data;
        }
        response = retried;
      } catch {
        // fall through to the original error handling
      }
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let payload: { error?: string; code?: string } = { error: response.statusText };
    if (isJson) {
      payload = (await response.json()) as { error?: string; code?: string };
    }
    throw new ApiRequestError({
      error: payload.error ?? `Request failed with ${response.status}`,
      code: payload.code,
      status: response.status,
    });
  }

  if (!isJson) {
    return undefined as T;
  }

  const data = (await response.json()) as T;
  if (method === "GET" && options.cache !== false) writeCache(path, data);
  return data;
}

async function requestBlob(path: string, body: unknown): Promise<Blob> {
  const url = buildUrl(path);
  const createHeaders = async () => ({ ...(await authHeaders()), "Content-Type": "application/json" });
  let response = await fetch(url, { method: "POST", headers: await createHeaders(), body: JSON.stringify(body) });
  if (response.status === 401) {
    clearToken();
    const fresh = await getToken();
    if (fresh) response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", authorization: `Bearer ${fresh}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiRequestError({ error: payload?.error ?? `Export failed (${response.status})`, status: response.status });
  }
  return response.blob();
}

export async function replayOutbox(): Promise<{ replayed: number; failed: number }> {
  const items = readOutbox();
  if (items.length === 0) return { replayed: 0, failed: 0 };

  let replayed = 0;
  let failed = 0;
  const remaining: OutboxItem[] = [];

  for (const item of items) {
    try {
      const headers = await authHeaders();
      if (item.body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(`${API_URL}${item.path}`, {
        method: item.method,
        headers,
        body: item.body === undefined ? undefined : JSON.stringify(item.body),
      });
      if (response.ok) {
        replayed += 1;
        continue;
      }
      if (response.status >= 400 && response.status < 500) {
        failed += 1;
        continue;
      }
      remaining.push({ ...item, attempts: item.attempts + 1, lastError: `HTTP ${response.status}` });
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1, lastError: "network" });
    }
  }

  writeOutbox(remaining);
  return { replayed, failed };
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    request<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions["query"]) =>
    request<T>(path, { method: "POST", body, query }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postBlob: (path: string, body: unknown) => requestBlob(path, body),
};
