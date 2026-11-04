/**
 * Outbound webhooks — signed, retried, and multi-replica safe.
 *
 * The platform study's webhook design, reduced to what we can run on Postgres
 * and Redis with no new services. What was kept, and why:
 *
 *   • **HMAC-SHA256 over the timestamp *and* the body.** A signature over the
 *     body alone is replayable forever; binding the timestamp lets a consumer
 *     reject an old delivery. The header is `sha256=<hex>` so the algorithm is
 *     versioned in-band and can be rotated later.
 *   • **Event filtering with namespaces.** A subscriber can ask for
 *     `application.status_changed`, for the namespace `application`, or for
 *     everything (`[]`). This mirrors how consumers actually write filters.
 *   • **At-least-once delivery from a durable queue.** The delivery row is
 *     written in the producer's transaction when a `client` is supplied, so an
 *     event cannot be lost between "committed" and "queued". Claiming uses
 *     `FOR UPDATE SKIP LOCKED`, which is what makes several worker replicas
 *     safe without a broker.
 *   • **Bounded retries with full jitter, then a dead letter.** Not infinite:
 *     a permanently broken endpoint must not accumulate work forever.
 *   • **A circuit breaker that auto-resets.** Repeated failures pause the
 *     endpoint for a cooldown instead of disabling it permanently, so a
 *     weekend outage does not silently unsubscribe a tenant.
 *
 * Hardening the study did not have, added because our consumers are third
 * parties:
 *
 *   • every URL is SSRF-checked before each attempt, including redirect hops,
 *     so a webhook cannot be pointed at the metadata service or a private
 *     range;
 *   • credentials in the URL, in error bodies and in our own logs are redacted
 *     (see `lib/redact.ts`);
 *   • the response body is read with a hard cap and only used to build a
 *     redacted error message.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type pg from "pg";
import { config } from "../../config.js";
import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { redactError, redactText, redactUrl } from "../../lib/redact.js";
import { assertPublicUrl, BlockedUrlError } from "../sources/http.js";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * The events we emit. Kept as a list (not a template-literal type) so an
 * endpoint's `events` array can be validated at registration time and a typo
 * is rejected instead of silently never firing.
 */
export const WEBHOOK_EVENTS = [
  "opportunity.created",
  "opportunity.expired",
  "application.created",
  "application.status_changed",
  "document.processed",
  "discovery.run.completed",
  "discovery.run.failed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/**
 * Whether a subscription matches an event.
 *
 * `[]`/undefined = everything. Otherwise exact match, or the namespace
 * (`application` matches `application.created`). Matching is
 * **case-sensitive**: event names are part of an API contract and quietly
 * accepting `Application.Created` would hide a producer bug.
 */
export function eventMatches(
  configured: readonly string[] | null | undefined,
  event: string,
): boolean {
  if (!configured || configured.length === 0) return true;
  if (configured.includes(event)) return true;
  const namespace = event.split(".")[0] ?? "";
  return configured.includes(namespace);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

const SIGNATURE_PREFIX = "sha256=";
const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export interface SignatureHeaders {
  "X-AngiSoft-Signature": string;
  "X-AngiSoft-Timestamp": string;
  "X-AngiSoft-Event": string;
  "X-AngiSoft-Delivery": string;
}

/** `sha256=<hex>` over `${timestamp}.${body}`, exactly what consumers verify. */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return (
    SIGNATURE_PREFIX +
    createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  );
}

export function buildSignatureHeaders(input: {
  secret: string;
  body: string;
  event: string;
  deliveryId: string;
  timestampMs?: number;
}): SignatureHeaders {
  const timestamp = String(input.timestampMs ?? Date.now());
  return {
    "X-AngiSoft-Signature": signWebhookPayload(
      input.secret,
      timestamp,
      input.body,
    ),
    "X-AngiSoft-Timestamp": timestamp,
    "X-AngiSoft-Event": input.event,
    "X-AngiSoft-Delivery": input.deliveryId,
  };
}

export interface VerifyInput {
  secret: string;
  body: string;
  signature: string;
  timestamp: string;
  /** Reject signatures older/newer than this. Default 5 minutes. */
  toleranceMs?: number;
  now?: number;
}

/**
 * Consumer-side verification, exported so our own tests (and any self-hosted
 * listener we ship) verify exactly the way a third party must.
 *
 * Returns `false` — never throws — for a malformed or stale signature:
 * verification failures are attacker-controlled input and must not be able to
 * crash a request handler.
 */
export function verifyWebhookSignature(input: VerifyInput): boolean {
  const tolerance = input.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const now = input.now ?? Date.now();

  const issuedAt = Number(input.timestamp);
  if (!Number.isFinite(issuedAt)) return false;
  // `timestamp` is milliseconds. Guard against seconds being passed by
  // mistake rather than silently accepting a 1970-era value.
  const issuedMs = issuedAt < 1e12 ? issuedAt * 1000 : issuedAt;
  if (Math.abs(now - issuedMs) > tolerance) return false;

  const expected = signWebhookPayload(input.secret, input.timestamp, input.body);
  const provided = input.signature.startsWith(SIGNATURE_PREFIX)
    ? input.signature
    : `${SIGNATURE_PREFIX}${input.signature}`;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;
  return timingSafeEqual(expectedBytes, providedBytes);
}

/** 32 bytes of entropy, base64url — paste-safe in a dashboard. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

// ---------------------------------------------------------------------------
// Endpoint registry
// ---------------------------------------------------------------------------

export interface WebhookEndpoint {
  id: string;
  userId: string | null;
  url: string;
  secret: string;
  previousSecret: string | null;
  previousSecretExpiresAt: Date | null;
  events: string[];
  headers: Record<string, string>;
  isActive: boolean;
}

interface EndpointRow {
  id: string;
  user_id: string | null;
  url: string;
  secret: string;
  previous_secret: string | null;
  previous_secret_expires_at: Date | null;
  events: string[] | null;
  headers: Record<string, string> | null;
  is_active: boolean;
}

function toEndpoint(row: EndpointRow): WebhookEndpoint {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    secret: row.secret,
    previousSecret: row.previous_secret,
    previousSecretExpiresAt: row.previous_secret_expires_at,
    events: row.events ?? [],
    headers: row.headers ?? {},
    isActive: row.is_active,
  };
}

export async function createWebhookEndpoint(input: {
  userId?: string | null;
  url: string;
  events?: string[];
  description?: string;
  headers?: Record<string, string>;
}): Promise<WebhookEndpoint & { revealedSecret: string }> {
  // Validate before touching the database: a bad URL is a client error, and
  // asserting publicness here stops an operator from ever registering one that
  // can only fail at delivery time.
  await assertPublicUrl(input.url);

  // Subscriptions may name a full event (`application.created`) or a namespace
  // (`application`). Anything that looks like a full event but is not in the
  // catalogue is a typo and is rejected now rather than silently never firing.
  const invalid = (input.events ?? []).filter(
    (event) => event.includes(".") && !isWebhookEvent(event),
  );
  if (invalid.length > 0) {
    throw new Error(`UNKNOWN_WEBHOOK_EVENTS: ${invalid.join(",")}`);
  }

  const secret = generateWebhookSecret();
  const result = await query<EndpointRow>(
    `INSERT INTO webhook_endpoints (user_id, url, description, secret, events, headers)
     VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb)
     RETURNING id, user_id, url, secret, previous_secret,
               previous_secret_expires_at, events, headers, is_active`,
    [
      input.userId ?? null,
      input.url,
      input.description ?? null,
      secret,
      input.events ?? [],
      JSON.stringify(input.headers ?? {}),
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error("WEBHOOK_ENDPOINT_INSERT_FAILED");
  return { ...toEndpoint(row), revealedSecret: secret };
}

/**
 * Rotates the signing secret with an overlap window, so a consumer can deploy
 * the new value before the old one stops being accepted.
 *
 * `userId` scopes the update to the owner: without it, any caller who guessed
 * an endpoint id could rotate somebody else's secret.
 */
export async function rotateWebhookSecret(
  endpointId: string,
  options: { overlapMs?: number; userId?: string | null } = {},
): Promise<string> {
  const secret = generateWebhookSecret();
  const result = await query<{ id: string }>(
    `UPDATE webhook_endpoints
        SET previous_secret = secret,
            previous_secret_expires_at = now() + ($2::bigint || ' milliseconds')::interval,
            secret = $3,
            failure_count = 0,
            paused_until = NULL,
            disabled_reason = NULL
      WHERE id = $1
        AND ($4::uuid IS NULL OR user_id = $4)
      RETURNING id`,
    [
      endpointId,
      options.overlapMs ?? 24 * 60 * 60 * 1000,
      secret,
      options.userId ?? null,
    ],
  );
  if (result.rowCount === 0) throw new Error("WEBHOOK_ENDPOINT_NOT_FOUND");
  return secret;
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export interface EnqueueWebhookInput {
  event: WebhookEvent;
  data: unknown;
  /** Producer-supplied idempotency key; the same key never enqueues twice. */
  eventId?: string;
  /**
   * Only endpoints owned by this user. Omit it for platform-level events,
   * which are delivered to *every* endpoint (including the platform ones).
   */
  userId?: string | null;
  /** Supply a transaction client to make enqueueing atomic with the write. */
  client?: pg.PoolClient;
}

/**
 * Writes one delivery row per matching endpoint and returns how many were
 * queued. Never throws on a per-endpoint problem — a webhook is a notification,
 * not a transaction participant.
 */
export async function enqueueWebhook(
  input: EnqueueWebhookInput,
): Promise<number> {
  const payload = {
    id: input.eventId ?? null,
    type: input.event,
    createdAt: new Date().toISOString(),
    data: input.data,
  };
  const serialised = JSON.stringify(payload);

  // 256 KB is well above any sane notification and well below the point where
  // a slow consumer turns our queue into a memory problem.
  if (serialised.length > 256 * 1024) {
    logger.warn(
      { event: input.event, bytes: serialised.length },
      "Webhook payload too large; dropped",
    );
    return 0;
  }

  const run = input.client
    ? (text: string, values: unknown[]) => input.client!.query(text, values)
    : (text: string, values: unknown[]) => query(text, values);

  const candidates = await run(
    `SELECT id, user_id, url, secret, previous_secret,
            previous_secret_expires_at, events, headers, is_active
       FROM webhook_endpoints
      WHERE is_active
        AND (paused_until IS NULL OR paused_until <= now())
        AND ($1::uuid IS NULL OR user_id = $1)`,
    [input.userId ?? null],
  );

  const targets = (candidates.rows as EndpointRow[]).filter((row) =>
    eventMatches(row.events, input.event),
  );
  if (targets.length === 0) return 0;

  let queued = 0;
  for (const endpoint of targets) {
    const inserted = await run(
      `INSERT INTO webhook_deliveries (endpoint_id, event_id, event, payload, next_attempt_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (endpoint_id, event_id) DO NOTHING`,
      [endpoint.id, input.eventId ?? null, input.event, serialised],
    );
    queued += inserted.rowCount ?? 0;
  }
  return queued;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const LEASE_MS = 60_000;
const RESPONSE_BODY_CAP = 4_096;
const MAX_REDIRECTS = 2;

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 524]);

interface DeliveryRow {
  id: string;
  endpoint_id: string;
  event: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  url: string;
  secret: string;
  previous_secret: string | null;
  previous_secret_expires_at: Date | null;
  headers: Record<string, string> | null;
}

/**
 * Claims up to `limit` due deliveries for this replica.
 *
 * `SKIP LOCKED` means two replicas never take the same row; the lease means a
 * replica that dies mid-delivery does not hold it forever (the reaper returns
 * it). The claim and the lease are one statement so there is no window where a
 * row is claimed but unlocked.
 */
export async function claimDueWebhooks(limit = 20): Promise<DeliveryRow[]> {
  const workerId = `${process.pid}:${randomBytes(4).toString("hex")}`;
  const result = await query<DeliveryRow>(
    `WITH due AS (
       SELECT d.id
         FROM webhook_deliveries d
        WHERE d.status = 'pending'
          AND d.next_attempt_at <= now()
        ORDER BY d.next_attempt_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE webhook_deliveries d
        SET status = 'delivering',
            locked_until = now() + ($2::bigint || ' milliseconds')::interval,
            locked_by = $3
       FROM due, webhook_endpoints e
      WHERE d.id = due.id
        AND e.id = d.endpoint_id
      RETURNING d.id, d.endpoint_id, d.event, d.payload, d.attempts,
                d.max_attempts, e.url, e.secret, e.previous_secret,
                e.previous_secret_expires_at, e.headers`,
    [limit, LEASE_MS, workerId],
  );
  return result.rows;
}

/**
 * Posts one delivery, following at most two redirects, each re-checked for
 * SSRF. Returns the outcome instead of throwing so the caller owns retry
 * accounting.
 */
async function postOnce(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; errorText: string; durationMs: number }> {
  const startedAt = Date.now();
  let current = await assertPublicUrl(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      // Drain the redirect body so the socket is reusable.
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        return {
          status: response.status,
          errorText: "REDIRECT_WITHOUT_LOCATION",
          durationMs: Date.now() - startedAt,
        };
      }
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    // Read at most RESPONSE_BODY_CAP bytes: a misbehaving consumer must not be
    // able to make us buffer an unbounded body.
    const text = await readCapped(response, RESPONSE_BODY_CAP);
    return {
      status: response.status,
      errorText: response.ok ? "" : redactText(text).slice(0, 400),
      durationMs: Date.now() - startedAt,
    };
  }

  return {
    // 599 is "this proxy/local failure" in the common convention; a redirect
    // loop is permanent, so it lands in the dead letter rather than retrying.
    status: 599,
    errorText: "TOO_MANY_REDIRECTS",
    durationMs: Date.now() - startedAt,
  };
}

async function readCapped(response: Response, cap: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total >= cap) {
        chunks.push(Buffer.from(value.slice(0, cap - (total - value.byteLength))));
        break;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function backoffMs(attempt: number): number {
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  // Full jitter: without it every endpoint that failed at the same second
  // retries at the same second, forever.
  return Math.floor(exponential / 2 + Math.random() * (exponential / 2));
}

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  retryable: number;
  dead: number;
}

/**
 * Drains one batch. Sequential rather than concurrent on purpose: a slow
 * consumer should delay the *next* delivery, not saturate our egress.
 */
export async function dispatchDueWebhooks(
  options: { limit?: number } = {},
): Promise<DispatchSummary> {
  if (config.WEBHOOK_DELIVERY_ENABLED === "false") {
    return { claimed: 0, delivered: 0, retryable: 0, dead: 0 };
  }

  const claimed = await claimDueWebhooks(options.limit ?? 20);
  const summary: DispatchSummary = {
    claimed: claimed.length,
    delivered: 0,
    retryable: 0,
    dead: 0,
  };

  for (const delivery of claimed) {
    await deliverOne(delivery, summary);
  }

  return summary;
}

async function deliverOne(
  delivery: DeliveryRow,
  summary: DispatchSummary,
): Promise<void> {
  const body = JSON.stringify({
    ...(delivery.payload as Record<string, unknown>),
    deliveryId: delivery.id,
  });

  const signingSecret = delivery.secret;
  const signatureHeaders = buildSignatureHeaders({
    secret: signingSecret,
    body,
    event: delivery.event,
    deliveryId: delivery.id,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AngiSoft-Webhooks/1.0",
    ...(delivery.headers ?? {}),
    ...signatureHeaders,
  };

  // When a rotation overlap is active, sign with both secrets so a consumer
  // can verify with either while it deploys.
  if (
    delivery.previous_secret &&
    delivery.previous_secret_expires_at &&
    delivery.previous_secret_expires_at.getTime() > Date.now()
  ) {
    headers["X-AngiSoft-Signature-Previous"] = signWebhookPayload(
      delivery.previous_secret,
      signatureHeaders["X-AngiSoft-Timestamp"],
      body,
    );
  }

  const attempt = delivery.attempts + 1;

  try {
    const result = await postOnce(
      delivery.url,
      body,
      headers,
      config.WEBHOOK_TIMEOUT_MS,
    );

    if (result.status >= 200 && result.status < 300) {
      await query(
        `UPDATE webhook_deliveries
            SET status = 'delivered',
                attempts = $2,
                status_code = $3,
                response_ms = $4,
                delivered_at = now(),
                locked_until = NULL,
                locked_by = NULL,
                last_error = NULL
          WHERE id = $1`,
        [delivery.id, attempt, result.status, result.durationMs],
      );
      await query(
        `UPDATE webhook_endpoints
            SET failure_count = 0, last_success_at = now(),
                paused_until = NULL, disabled_reason = NULL
          WHERE id = $1`,
        [delivery.endpoint_id],
      );
      summary.delivered += 1;
      return;
    }

    const retryable = RETRY_STATUSES.has(result.status);
    await markFailure(delivery, attempt, {
      statusCode: result.status,
      responseMs: result.durationMs,
      error: `HTTP_${result.status}${result.errorText ? `: ${result.errorText}` : ""}`,
      retryable,
    });
    if (retryable && attempt < delivery.max_attempts) summary.retryable += 1;
    else summary.dead += 1;
  } catch (error) {
    const blocked = error instanceof BlockedUrlError;
    const redacted = redactError(error);
    await markFailure(delivery, attempt, {
      responseMs: 0,
      error: blocked
        ? `BLOCKED_URL: ${redacted.message}`
        : redacted.message,
      // A blocked destination will never become valid; permanent.
      retryable: !blocked,
    });
    if (!blocked && attempt < delivery.max_attempts) summary.retryable += 1;
    else summary.dead += 1;

    logger.warn(
      {
        deliveryId: delivery.id,
        endpointUrl: redactUrl(delivery.url),
        event: delivery.event,
        attempt,
        error: redacted,
      },
      "Webhook delivery failed",
    );
  }
}

async function markFailure(
  delivery: DeliveryRow,
  attempt: number,
  outcome: {
    statusCode?: number;
    responseMs: number;
    error: string;
    retryable: boolean;
  },
): Promise<void> {
  const dead = !outcome.retryable || attempt >= delivery.max_attempts;
  const delay = backoffMs(attempt);

  await query(
    `UPDATE webhook_deliveries
        SET status = $2,
            attempts = $3,
            status_code = $4,
            response_ms = $5,
            last_error = $6,
            next_attempt_at = CASE WHEN $2 = 'pending'
                                   THEN now() + ($7::bigint || ' milliseconds')::interval
                                   ELSE next_attempt_at END,
            locked_until = NULL,
            locked_by = NULL
      WHERE id = $1`,
    [
      delivery.id,
      dead ? "dead" : "pending",
      attempt,
      outcome.statusCode ?? null,
      outcome.responseMs,
      outcome.error.slice(0, 1_000),
      delay,
    ],
  );

  // Endpoint-level breaker: pause after several consecutive failures, and let
  // the reaper resume it. Pausing is not unsubscribing.
  const endpoint = await query<{ failure_count: number }>(
    `UPDATE webhook_endpoints
        SET failure_count = failure_count + 1,
            last_failure_at = now()
      WHERE id = $1
      RETURNING failure_count`,
    [delivery.endpoint_id],
  );
  const failures = endpoint.rows[0]?.failure_count ?? 0;
  if (failures >= config.WEBHOOK_PAUSE_AFTER_FAILURES) {
    await query(
      `UPDATE webhook_endpoints
          SET paused_until = now() + ($2::bigint || ' milliseconds')::interval,
              disabled_reason = $3
        WHERE id = $1
          AND (paused_until IS NULL OR paused_until <= now())`,
      [
        delivery.endpoint_id,
        config.WEBHOOK_PAUSE_MS,
        `AUTO_PAUSED_AFTER_${failures}_FAILURES`,
      ],
    );
  }
}

/**
 * Returns expired leases to `pending`. Without this a worker killed mid-POST
 * leaves the row in `delivering` with nobody to finish it.
 */
export async function reapStuckWebhookDeliveries(): Promise<number> {
  const result = await query(
    `UPDATE webhook_deliveries
        SET status = 'pending',
            locked_until = NULL,
            locked_by = NULL,
            next_attempt_at = now()
      WHERE status = 'delivering'
        AND locked_until IS NOT NULL
        AND locked_until <= now()`,
  );
  return result.rowCount ?? 0;
}

/** Clears `paused_until` on endpoints whose cooldown has elapsed. */
export async function resumePausedWebhookEndpoints(): Promise<number> {
  const result = await query(
    `UPDATE webhook_endpoints
        SET paused_until = NULL,
            failure_count = 0,
            disabled_reason = NULL
      WHERE paused_until IS NOT NULL
        AND paused_until <= now()`,
  );
  return result.rowCount ?? 0;
}

/** Prunes delivered/dead history; keeps the queue tables small. */
export async function pruneWebhookDeliveries(olderThanDays = 30): Promise<number> {
  const result = await query(
    `DELETE FROM webhook_deliveries
      WHERE status IN ('delivered', 'dead')
        AND created_at < now() - ($1::int || ' days')::interval`,
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}
