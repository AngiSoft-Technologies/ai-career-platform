/**
 * Runtime configuration.
 *
 * Every secret here is server-side. The web app never receives the runtime
 * token or the upload signing secret; its `/api/browser-workspace` proxy owns
 * both and injects them into server-to-server calls.
 */

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/**
 * Only these hosts may be used for ordinary signed PDF URLs. A hostname that
 * starts with a dot matches subdomains. Browser navigation is intentionally
 * NOT restricted to this list: the whole point is to open the employer's
 * public site.
 */
function uploadHosts(): string[] {
  const raw = process.env.UPLOAD_ALLOWED_HOSTS ?? "cdn1.angisoft.co.ke";
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: integer("PORT", 8787, 1, 65535),
  token: process.env.BROWSER_RUNTIME_TOKEN ?? "",
  uploadSecret: process.env.BROWSER_UPLOAD_SECRET ?? process.env.BROWSER_RUNTIME_TOKEN ?? "",
  frameIntervalMs: integer("FRAME_RATE_LIMIT_MS", 700, 100, 5000),
  maxSessions: integer("MAX_BROWSER_SESSIONS", 4, 1, 64),
  sessionTtlMs: integer("SESSION_IDLE_TTL_MS", 30 * 60 * 1000, 60_000, 4 * 60 * 60 * 1000),
  uploadMaxBytes: integer("UPLOAD_MAX_BYTES", 12 * 1024 * 1024, 1024, 32 * 1024 * 1024),
  uploadAllowedHosts: uploadHosts(),
  allowPrivateNavigation: process.env.ALLOW_PRIVATE_NAVIGATION === "true",
} as const;

export function assertConfigured(): void {
  if (!config.token) {
    throw new Error("BROWSER_RUNTIME_TOKEN must be set before the runtime starts");
  }
  if (!config.uploadSecret) {
    throw new Error("BROWSER_UPLOAD_SECRET must be set before the runtime starts");
  }
}
