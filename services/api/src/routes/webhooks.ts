import { Router } from "express";
import express from "express";
import { createPublicKey, verify } from "node:crypto";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { ensureLocalUser } from "../auth/neon-auth.js";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";

export const webhookRouter = Router();

interface Jwk {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
}

interface WebhookUser {
  id?: string;
  email?: string;
  name?: string;
}

interface WebhookPayload {
  event_id?: string;
  event_type?: string;
  timestamp?: string;
  user?: WebhookUser;
  event_data?: Record<string, unknown>;
}

const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const JWKS_CACHE_MS = 10 * 60 * 1000;

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getJwks(): Promise<Jwk[]> {
  if (!config.NEON_AUTH_JWKS_URL) {
    throw new Error("NEON_AUTH_JWKS_URL is not configured");
  }
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(config.NEON_AUTH_JWKS_URL);
  if (!response.ok) {
    throw new Error(`JWKS request failed with ${response.status}`);
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  jwksCache = { keys: body.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

async function verifySignature(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<boolean> {
  const signature = headers["x-neon-signature"];
  const kid = headers["x-neon-signature-kid"];
  const timestamp = headers["x-neon-timestamp"];

  if (
    typeof signature !== "string" ||
    typeof kid !== "string" ||
    typeof timestamp !== "string"
  ) {
    return false;
  }

  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  if (age > SIGNATURE_TOLERANCE_MS || age < -60_000) return false;

  const keys = await getJwks();
  const jwk = keys.find((key) => key.kid === kid);
  if (!jwk) return false;

  const [headerB64, payloadB64, signatureB64] = signature.split(".");
  if (payloadB64 !== "" || !headerB64 || !signatureB64) return false;

  const publicKey = createPublicKey({
    key: jwk as JsonWebKey,
    format: "jwk",
  });

  const encodedPayload = rawBody.toString("base64url");
  const signaturePayload = `${timestamp}.${encodedPayload}`;
  const signingInput = `${headerB64}.${Buffer.from(signaturePayload, "utf8").toString("base64url")}`;

  return verify(
    null,
    Buffer.from(signingInput, "utf8"),
    publicKey,
    Buffer.from(signatureB64, "base64url"),
  );
}

async function alreadyProcessed(eventId: string, eventType: string): Promise<boolean> {
  const result = await query(
    `INSERT INTO auth_webhook_events (event_id, event_type)
     VALUES ($1::uuid, $2)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, eventType],
  );
  return result.rowCount === 0;
}

const NEON_TO_APP_ROLE: Record<string, string> = {
  super_admin: "super_admin",
  admin: "admin",
  moderator: "moderator",
  support_agent: "support_agent",
  source_curator: "source_curator",
  analyst: "analyst",
  job_seeker: "job_seeker",
  automation: "automation",
};

async function syncUser(user: WebhookUser): Promise<void> {
  if (!user.id || !user.email) return;
  await ensureLocalUser({
    userId: user.id,
    email: user.email,
    name: user.name ?? user.email,
  });
  if (user.id) {
    const neonUser = await query<{ role: string }>(
      `SELECT role FROM neon_auth."user" WHERE id = $1`,
      [user.id],
    );
    if (neonUser.rows[0]?.role) {
      const appRole = NEON_TO_APP_ROLE[neonUser.rows[0].role];
      if (appRole) {
        await query(
          `INSERT INTO public.user_roles (user_id, role_id)
           SELECT $1, r.id FROM roles r
            WHERE r.name = $2
              AND NOT EXISTS (
                SELECT 1 FROM user_roles ur WHERE ur.user_id = $1 AND ur.role_id = r.id AND ur.is_active = true
              )
           ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, expires_at = NULL`,
          [user.id, appRole],
        );
      }
    }
  }
}

webhookRouter.post(
  "/neon-auth",
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  express.raw({ type: "application/json", limit: "256kb" }),
  async (request, response) => {
    const rawBody = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(String(request.body ?? ""), "utf8");

    let valid = false;
    try {
      valid = await verifySignature(rawBody, request.headers);
    } catch (error) {
      logger.error(
        {
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "Neon Auth webhook signature check failed",
      );
    }

    if (!valid) {
      response.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as WebhookPayload;
    } catch {
      response.status(400).json({ error: "Invalid webhook payload" });
      return;
    }

    const eventType = payload.event_type ?? "";
    const eventId = payload.event_id ?? "";

    if (eventType === "user.before_create") {
      response.status(200).json({ allowed: true });
      return;
    }

    if (!eventId) {
      response.status(200).json({ ok: true });
      return;
    }

    try {
      const duplicate = await alreadyProcessed(eventId, eventType);
      if (!duplicate) {
        if (eventType === "user.created") {
          await syncUser(payload.user ?? {});
        }
        logger.info({ eventType, eventId }, "Neon Auth webhook processed");
      }
    } catch (error) {
      logger.error(
        {
          eventType,
          eventId,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "Neon Auth webhook handling failed",
      );
      response.status(500).json({ error: "Webhook handling failed" });
      return;
    }

    response.status(200).json({ ok: true });
  },
);
