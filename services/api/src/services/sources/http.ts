/**
 * The shared outbound HTTP client for source connectors.
 *
 * Every connector (RSS, HTML, each ATS) calls `safeFetch`, so this file is the
 * one place where "what are we allowed to fetch, and how do we not leak
 * credentials while doing it" is decided. It was extracted from a version that
 * followed redirects with `redirect: "follow"` and read the whole body before
 * truncating it, which had three real problems:
 *
 *   1. **Redirects escaped the SSRF check.** `assertPublicUrl` ran once on the
 *      URL we chose; `follow` then went wherever the server said, including
 *      169.254.169.254. Redirects are now followed manually, with the guard
 *      re-run on every hop, and https→http downgrades refused.
 *   2. **The size cap was applied after buffering.** `arrayBuffer()` already
 *      had the whole response in memory. The body is now read as a stream and
 *      cancelled at the cap, so a hostile or broken source cannot exhaust the
 *      process.
 *   3. **Credentials leaked into logs and error strings.** URLs and response
 *      bodies are redacted through `lib/redact.ts` before they are attached to
 *      an error or a log line.
 *
 * The client is intentionally small: GET/HEAD/POST, a byte cap, a timeout, and
 * a redirect budget. Anything more specific belongs in the connector.
 */

import { BlockedUrlError, assertPublicUrl, isPrivateAddress } from "../../lib/net-guard.js";
import { redactUrl } from "../../lib/redact.js";

export { BlockedUrlError, assertPublicUrl, isPrivateAddress };

export interface SafeFetchOptions {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Maximum body bytes retained. Default 3 MB. */
  maxBytes?: number;
  /** Redirects to follow, each re-validated. Default 3. */
  maxRedirects?: number;
  /** Accept `http:` as well as `https:` (default true for feed URLs). */
  allowInsecure?: boolean;
}

export interface SafeFetchResult {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
  durationMs: number;
  /** True when the body was cut at `maxBytes`. */
  truncated: boolean;
  /** Redirect hops followed, for debugging a source that moved. */
  redirects: number;
}

const DEFAULT_USER_AGENT =
  "JobRadarBot/1.0 (+https://www.angisoft.co.ke; job discovery bot)";

const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/json,application/rss+xml,application/xml;q=0.9,*/*;q=0.8";

/** Statuses that mean "try again later", surfaced to the caller's retry. */
export const RETRYABLE_STATUSES = new Set([
  408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 524,
]);

export class HttpFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpFetchError";
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 ||
    status === 307 || status === 308;
}

/**
 * Reads at most `cap` bytes. Cancels the stream once the cap is reached so the
 * server stops sending and the socket is released.
 */
async function readCapped(
  response: Response,
  cap: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = cap - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total = cap;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Cancelling is best-effort: a source that already closed the stream
    // throws here, and that is not a failure of the request.
    await reader.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(merged),
    truncated,
  };
}

const CREDENTIAL_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "x-access-token",
];

/**
 * Builds the outgoing headers.
 *
 * `origin` is the origin the caller meant to talk to. When a redirect leads
 * somewhere else, the credential headers are dropped: an `Authorization`
 * header meant for the source site must not travel to a third party that the
 * source site chose to redirect us to.
 */
function buildHeaders(
  options: SafeFetchOptions,
  origin: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": DEFAULT_USER_AGENT,
    Accept: DEFAULT_ACCEPT,
    ...(options.headers ?? {}),
  };

  if (origin !== null) {
    for (const name of Object.keys(headers)) {
      if (CREDENTIAL_HEADERS.includes(name.toLowerCase())) {
        delete headers[name];
      }
    }
  }

  return headers;
}

/**
 * Fetches a URL with SSRF checks on every hop, a hard byte cap, and redacted
 * errors. Throws `BlockedUrlError` for a policy refusal (never retryable) and
 * `HttpFetchError` for an HTTP-level failure the caller may retry based on
 * `RETRYABLE_STATUSES`.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const startedAt = Date.now();
  const maxBytes = options.maxBytes ?? 3_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const method = options.method ?? "GET";

  let current = await assertPublicUrl(rawUrl);
  if (options.allowInsecure === false && current.protocol !== "https:") {
    throw new BlockedUrlError("UNSUPPORTED_PROTOCOL", "https required");
  }

  let redirects = 0;
  const initialOrigin = current.origin;

  for (;;) {
    const response = await fetch(current, {
      method,
      headers: buildHeaders(
        options,
        current.origin === initialOrigin ? null : current.origin,
      ),
      body: method === "GET" || method === "HEAD" ? undefined : options.body,
      // Manual: `follow` would take the guard's decision and discard it.
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);

      if (!location) {
        throw new HttpFetchError(
          "REDIRECT_WITHOUT_LOCATION",
          response.status,
          redactUrl(current.toString()),
        );
      }
      if (redirects >= maxRedirects) {
        throw new HttpFetchError(
          "TOO_MANY_REDIRECTS",
          response.status,
          redactUrl(current.toString()),
        );
      }

      const next = new URL(location, current);
      if (current.protocol === "https:" && next.protocol === "http:") {
        throw new BlockedUrlError(
          "UNSUPPORTED_PROTOCOL",
          "refusing https to http downgrade",
        );
      }

      current = await assertPublicUrl(next.toString(), {
        onDnsFailure: "throw",
      });
      redirects += 1;
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (method === "HEAD") {
      await response.body?.cancel().catch(() => undefined);
      return {
        status: response.status,
        contentType,
        body: "",
        finalUrl: current.toString(),
        durationMs: Date.now() - startedAt,
        truncated: false,
        redirects,
      };
    }

    const { text, truncated } = await readCapped(response, maxBytes);

    // HTTP-level failures are *returned*, not thrown: the connectors decide
    // what a 404 or a 503 means for their source (a health check reports the
    // status; a fetch raises its own error). Only policy refusals and
    // transport failures throw from here.
    return {
      status: response.status,
      contentType,
      body: text,
      finalUrl: current.toString(),
      durationMs: Date.now() - startedAt,
      truncated,
      redirects,
    };
  }
}
