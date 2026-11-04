/**
 * Credential redaction.
 *
 * Every URL, header bag and error message we log is untrusted when it comes
 * from a user, a source connector, or a third-party API — any of them can
 * carry a token in the query string, a password in the userinfo, or a bearer
 * credential in a header. Logging those verbatim leaks them to whatever
 * collects our logs (Fly, Loki, Sentry, a screenshot in a bug report).
 *
 * This module is the single place that decides what is safe to emit:
 *
 *   • `redactUrl`     — strips userinfo and the *values* of credential-shaped
 *                       query parameters, keeping the keys so a URL is still
 *                       recognisable in a log line.
 *   • `redactHeaders` — keeps well-known non-secret headers, redacts anything
 *                       that looks like a credential, and masks an
 *                       `Authorization` scheme while preserving the scheme name.
 *   • `redactText`    — masks `Bearer …`, `token=…`, `api_key=…` and friends
 *                       in free-form strings such as upstream error bodies.
 *   • `redactError`   — {name, message, code} with the message redacted, so an
 *                       error object can be logged without dumping internals.
 *
 * The defaults are deliberately keep-the-shape, hide-the-value: an engineer
 * debugging an integration needs to see *that* a token was sent and *which*
 * parameter carried it, never the token itself.
 */

const SECRET_QUERY_KEYS = [
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apikey",
  "key",
  "secret",
  "client_secret",
  "password",
  "passwd",
  "pwd",
  "auth",
  "authorization",
  "signature",
  "sig",
  "hmac",
  "credential",
  "credentials",
  "session",
  "sessionid",
  "otp",
  "code",
  "jwt",
  "bearer",
] as const;

/** Query keys that merely *contain* a secret-looking word but are harmless. */
const SAFE_QUERY_KEYS = new Set([
  "page_token",
  "next_page_token",
  "cursor",
  "sort",
  "order",
  "q",
  "query",
  "search",
  "lang",
  "language",
  "locale",
  "limit",
  "offset",
  "per_page",
  "page",
]);

const SECRET_HEADER_NAMES = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "x-access-token",
  "x-signature",
  "x-hmac-signature",
  "x-webhook-signature",
  "x-csrf-token",
  "x-xsrf-token",
  "private-token",
  "x-slack-signature",
] as const;

const REDACTED = "[redacted]";
const SECRET_PLACEHOLDER = "***";

function isSecretKey(rawKey: string): boolean {
  const key = rawKey.trim().toLowerCase();
  if (SAFE_QUERY_KEYS.has(key)) return false;
  if ((SECRET_QUERY_KEYS as readonly string[]).includes(key)) return true;
  // Catch `accessToken`, `client-secret`, `X-Api-Key`, `auth_token`, etc.
  return /(?:^|[-_])(?:token|secret|password|passwd|apikey|api[-_]?key|signature|credential|otp)(?:$|[-_])/.test(
    key,
  );
}

/**
 * URL with userinfo removed and secret query values masked.
 *
 * Returns the original string when it is not a parseable absolute URL: an
 * unparseable string might itself be a credential (a bare token pasted into a
 * field), and passing it through unchanged is worse than refusing to parse.
 */
export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not a URL. A long, space-free string that failed to parse is far more
    // likely to be a raw credential than a sentence, so it is masked whole.
    // Anything with spaces is treated as prose and only its credential-shaped
    // parts are masked.
    if (!/\s/.test(raw) && raw.length >= 16) return REDACTED;
    return redactText(raw);
  }

  let changed = false;
  if (url.username || url.password) {
    url.username = "";
    url.password = "";
    changed = true;
  }

  for (const key of [...url.searchParams.keys()]) {
    if (!isSecretKey(key)) continue;
    // Preserve repeated keys' cardinality, mask the value.
    const values = url.searchParams.getAll(key);
    url.searchParams.delete(key);
    for (let index = 0; index < values.length; index += 1) {
      url.searchParams.append(key, REDACTED);
    }
    changed = true;
  }

  // `URL` normalises the query string even when unchanged; only pay the cost
  // of rendering when we actually masked something, otherwise return the
  // caller's exact string (tests and logs stay byte-identical).
  return changed ? url.toString() : raw;
}

/** Header bag with credential headings masked, names preserved. */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    const joined = Array.isArray(value) ? value.join(", ") : value;

    if ((SECRET_HEADER_NAMES as readonly string[]).includes(lower)) {
      // Keep the scheme (`Bearer`, `Basic`) but never the credential.
      const scheme = /^(bearer|basic|digest|token)\s/i.exec(joined)?.[1];
      safe[name] = scheme ? `${scheme} ${SECRET_PLACEHOLDER}` : SECRET_PLACEHOLDER;
      continue;
    }
    if (isSecretKey(lower)) {
      safe[name] = SECRET_PLACEHOLDER;
      continue;
    }
    safe[name] = joined;
  }
  return safe;
}

const TEXT_PATTERNS: Array<[RegExp, string]> = [
  // Authorization schemes: Bearer abc.def, Basic dXNlcjpwYXNz
  [/\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${SECRET_PLACEHOLDER}`],
  // key=value / key: value in query strings, JSON and error messages.
  [
    /\b(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|client[_-]?secret|token|secret|password|passwd|signature|hmac|credentials?)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,&;}"']+)/gi,
    `$1$2${SECRET_PLACEHOLDER}`,
  ],
  // JWTs anywhere (three base64url segments, eyJ… header).
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, SECRET_PLACEHOLDER],
  // Long provider-specific keys: sk_live_…, ghp_…, xoxb-…, AIza…
  [/\b(sk|pk)_(live|test)_[A-Za-z0-9]{8,}\b/g, SECRET_PLACEHOLDER],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{20,})\b/g, SECRET_PLACEHOLDER],
  // Neon connection strings: keep the host, hide the password.
  [/\b(postgres(?:ql)?:\/\/[^:/@\s]+:)([^@\s]+)(@)/gi, `$1${SECRET_PLACEHOLDER}$3`],
];

/** Masks credential-shaped substrings in free text (error bodies included). */
export function redactText(raw: string): string {
  let output = raw;
  for (const [pattern, replacement] of TEXT_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export interface RedactedError {
  name: string;
  message: string;
  code?: string;
  status?: number;
}

/**
 * A loggable view of any thrown value. Nested `cause` chains are flattened
 * into the message so a wrapped upstream error keeps its detail — redacted.
 */
export function redactError(error: unknown): RedactedError {
  if (!(error instanceof Error)) {
    return { name: "UnknownError", message: redactText(String(error)).slice(0, 500) };
  }

  const record = error as Error & {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    cause?: unknown;
  };

  const causes: string[] = [];
  let cause: unknown = record.cause;
  for (let depth = 0; depth < 3 && cause instanceof Error; depth += 1) {
    causes.push(cause.message);
    cause = (cause as Error & { cause?: unknown }).cause;
  }

  const message = [error.message, ...causes]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" <- ");

  const result: RedactedError = {
    name: error.name || "Error",
    message: redactText(message).slice(0, 800),
  };

  if (typeof record.code === "string" || typeof record.code === "number") {
    result.code = String(record.code);
  }
  const status = record.status ?? record.statusCode;
  if (typeof status === "number") result.status = status;

  return result;
}

/** Convenience for `logger.*({...}, "msg")` call sites that log a URL. */
export function loggableUrl(raw: string): string {
  return redactUrl(raw);
}
