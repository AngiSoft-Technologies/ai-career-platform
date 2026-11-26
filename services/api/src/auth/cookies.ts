import type { Request, Response } from "express";
import { config } from "../config.js";

/**
 * Cookie transport for the browser session.
 *
 * The API still returns tokens in the JSON body — mobile clients and the
 * WebSocket handshake need them — but the web app is served same-origin
 * through the `/api` proxy, so the browser can keep the session in
 * httpOnly cookies instead of localStorage. The access cookie is short
 * lived; the refresh cookie is the long-lived one and is what makes "stay
 * signed in" survive restarts without a credential sitting in web storage.
 */

export const ACCESS_COOKIE = "mboqara_access";
export const REFRESH_COOKIE = "mboqara_refresh";

/** Paths the web proxy exposes; cookies are scoped to them. */
const ACCESS_COOKIE_PATH = "/api";
const REFRESH_COOKIE_PATH = "/api/auth";

function secure(): boolean {
  return config.NODE_ENV === "production";
}

function serialize(
  name: string,
  value: string,
  options: {
    path: string;
    maxAgeSeconds: number;
    httpOnly?: boolean;
  },
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    "SameSite=Lax",
  ];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (secure()) parts.push("Secure");
  return parts.join("; ");
}

function appendCookie(response: Response, cookie: string): void {
  const existing = response.getHeader("Set-Cookie");
  if (!existing) {
    response.setHeader("Set-Cookie", cookie);
    return;
  }
  const list = Array.isArray(existing)
    ? existing.map(String)
    : [String(existing)];
  response.setHeader("Set-Cookie", [...list, cookie]);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** The bearer token for this request: header first, then the access cookie. */
export function requestAccessToken(request: Request): string | null {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) return token;
  }
  return readCookie(request, ACCESS_COOKIE);
}

export function requestRefreshToken(request: Request): string | null {
  return readCookie(request, REFRESH_COOKIE);
}

export function setAuthCookies(
  response: Response,
  session: {
    accessToken: string;
    accessExpiresAt: Date;
    refreshToken: string;
    refreshExpiresAt: Date;
  },
): void {
  const now = Date.now();
  appendCookie(
    response,
    serialize(ACCESS_COOKIE, session.accessToken, {
      path: ACCESS_COOKIE_PATH,
      maxAgeSeconds: Math.floor((session.accessExpiresAt.getTime() - now) / 1000),
    }),
  );
  appendCookie(
    response,
    serialize(REFRESH_COOKIE, session.refreshToken, {
      path: REFRESH_COOKIE_PATH,
      maxAgeSeconds: Math.floor(
        (session.refreshExpiresAt.getTime() - now) / 1000,
      ),
    }),
  );
}

export function clearAuthCookies(response: Response): void {
  for (const [name, path] of [
    [ACCESS_COOKIE, ACCESS_COOKIE_PATH],
    [REFRESH_COOKIE, REFRESH_COOKIE_PATH],
  ] as const) {
    appendCookie(
      response,
      serialize(name, "", { path, maxAgeSeconds: 0 }),
    );
  }
}
