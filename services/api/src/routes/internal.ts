import { Router } from "express";
import { z } from "zod";
import { assertPublicUrl } from "../services/engine/fetch.js";
import { directFetch } from "../services/engine/egress.js";

/**
 * Internal-only egress endpoint.
 *
 * This is how our own multi-region proxy works: a worker can ask any other
 * API Machine (in a different Fly region) to perform a request, so the target
 * site sees that Machine's IP instead of the worker's. No third-party proxy
 * provider is involved.
 *
 * It is never exposed publicly: Fly routes `/internal/*` only over the private
 * 6PN network when the service is configured that way, and we additionally
 * require a shared token.
 */
export const internalRouter = Router();

const egressSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
});

internalRouter.post("/egress", async (request, response) => {
  const expected = process.env.EGRESS_TOKEN;
  const supplied = request.header("x-egress-token");
  if (!expected || supplied !== expected) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = egressSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  try {
    // Same SSRF rules as the main fetcher.
    const target = await assertPublicUrl(parsed.data.url);
    // Never forward credentials through the egress hop.
    const safeHeaders = Object.fromEntries(
      Object.entries(parsed.data.headers ?? {}).filter(
        ([name]) =>
          !["authorization", "cookie", "proxy-authorization"].includes(
            name.toLowerCase(),
          ),
      ),
    );
    const result = await directFetch(target.toString(), {
      method: parsed.data.method,
      headers: safeHeaders,
      signal: AbortSignal.timeout(25_000),
    });

    response.json({
      status: result.status,
      headers: result.headers,
      bodyBase64: Buffer.from(result.body).toString("base64"),
      finalUrl: result.finalUrl,
    });
  } catch (error) {
    response.status(502).json({
      error: "Egress request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
