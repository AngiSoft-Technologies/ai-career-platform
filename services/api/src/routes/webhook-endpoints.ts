/**
 * Outbound webhook endpoints — the tenant-facing side of the webhook system.
 *
 * A tenant registers a URL, receives a signing secret **once**, and then
 * verifies every delivery with `X-AngiSoft-Signature`. The secret is never
 * returned again; rotation produces a new secret and keeps the previous one
 * valid for an overlap window so a consumer can deploy before it switches.
 *
 * Everything here is scoped to the calling user. Platform-level endpoints
 * (no owner) are managed operationally, not through this API.
 */

import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import {
  WEBHOOK_EVENTS,
  createWebhookEndpoint,
  rotateWebhookSecret,
} from "../services/webhooks/outbound.js";
import { redactUrl } from "../lib/redact.js";

export const webhookEndpointRouter = Router();

const registerSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.string().max(80)).max(32).optional(),
  description: z.string().max(500).optional(),
  headers: z.record(z.string().max(200), z.string().max(2_000)).optional(),
});

function currentUserId(response: { locals: Record<string, unknown> }): string {
  const userId = response.locals.userId;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && error.message === "UNAUTHORIZED";
}

webhookEndpointRouter.get("/", async (request, response, next) => {
  try {
    const userId = currentUserId(response);
    const result = await query<{
      id: string;
      url: string;
      description: string | null;
      events: string[] | null;
      is_active: boolean;
      failure_count: number;
      paused_until: Date | null;
      disabled_reason: string | null;
      last_success_at: Date | null;
      last_failure_at: Date | null;
      created_at: Date;
      secret_hint: string;
    }>(
      `SELECT id, url, description, events, is_active, failure_count,
              paused_until, disabled_reason, last_success_at, last_failure_at,
              created_at,
              left(secret, 6) AS secret_hint
         FROM webhook_endpoints
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );

    response.json({
      items: result.rows.map((row) => ({
        ...row,
        // The stored URL can carry a token in its query string; the tenant
        // still sees *their* URL, but the credentials are not echoed.
        url: redactUrl(row.url),
      })),
      availableEvents: WEBHOOK_EVENTS,
    });
  } catch (error) {
    if (isUnauthorized(error)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    next(error);
  }
});

webhookEndpointRouter.post("/", async (request, response, next) => {
  try {
    const userId = currentUserId(response);
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
      return;
    }

    const endpoint = await createWebhookEndpoint({
      userId,
      url: parsed.data.url,
      events: parsed.data.events ?? [],
      description: parsed.data.description,
      headers: parsed.data.headers,
    });

    response.status(201).json({
      id: endpoint.id,
      url: redactUrl(endpoint.url),
      events: endpoint.events,
      // Shown once. There is no endpoint that returns it again.
      secret: endpoint.revealedSecret,
      signatureHeader: "X-AngiSoft-Signature",
      signatureScheme: "sha256=HMAC_SHA256(secret, `${timestamp}.${body}`)",
      rotationOverlapHours: 24,
    });
  } catch (error) {
    if (isUnauthorized(error)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("UNKNOWN_WEBHOOK_EVENTS")) {
      response.status(400).json({ error: message });
      return;
    }
    if (message === "INVALID_URL" || message.startsWith("PRIVATE_")) {
      response.status(400).json({ error: "URL_REJECTED", detail: message });
      return;
    }
    next(error);
  }
});

webhookEndpointRouter.post("/:id/rotate", async (request, response, next) => {
  try {
    const userId = currentUserId(response);
    const endpointId = String(request.params.id ?? "");
    const secret = await rotateWebhookSecret(endpointId, { userId });
    response.json({
      id: endpointId,
      secret,
      note: "The previous secret stays valid for 24 hours.",
    });
  } catch (error) {
    if (isUnauthorized(error)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message === "WEBHOOK_ENDPOINT_NOT_FOUND") {
      response.status(404).json({ error: message });
      return;
    }
    next(error);
  }
});

webhookEndpointRouter.delete("/:id", async (request, response, next) => {
  try {
    const userId = currentUserId(response);
    const endpointId = String(request.params.id ?? "");
    const result = await query(
      `DELETE FROM webhook_endpoints WHERE id = $1 AND user_id = $2`,
      [endpointId, userId],
    );
    if (result.rowCount === 0) {
      response.status(404).json({ error: "WEBHOOK_ENDPOINT_NOT_FOUND" });
      return;
    }
    response.status(204).end();
  } catch (error) {
    if (isUnauthorized(error)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    next(error);
  }
});
