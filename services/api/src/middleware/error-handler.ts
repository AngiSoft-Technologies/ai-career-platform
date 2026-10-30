import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";

const statusByCode: Record<string, number> = {
  PROFILE_NOT_FOUND: 404,
  OPPORTUNITY_NOT_FOUND: 404,
  APPLICATION_NOT_FOUND: 404,
  DOCUMENT_NOT_FOUND: 404,
  DOCUMENT_TYPE_CANNOT_BE_TAILORED: 400,
  AI_NOT_CONFIGURED: 503,
  TAILORING_INVALID_RESPONSE: 502,
  VERSION_CONFLICT: 409,
  STORAGE_NOT_CONFIGURED: 503,
  UNSUPPORTED_DOCUMENT_TYPE: 400,
  BLUEPRINT_CREATE_FAILED: 500,
  APPLICATION_CREATE_FAILED: 500,
  DOCUMENT_CREATE_FAILED: 500,
};

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Not found" });
};

/**
 * Fly Replay support.
 *
 * Fly's edge proxy stamps `fly-request-id`, `fly-client-id` and
 * `fly-replay: true` on requests it can replay. Echoing the request id and
 * marking the response lets `fly replay <request-id>` reconstruct the exact
 * request against a local machine.
 *
 * Write routing is a separate concern and is off by default.
 * `fly replay` moves a whole request to another region, which only pays off
 * when that region holds something the current one does not — today every
 * machine talks to the same Neon primary, so a replay from `jnb` to `fra`
 * would add a hop and gain nothing. Set `WRITE_REPLAY_REGION` once a machine
 * sits next to a regional read/write database; see §5 of
 * PLATFORM_ARCHITECTURE_10M.md.
 */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** The proxy refuses to replay anything larger than this. */
const REPLAYABLE_REQUEST_LIMIT = 1_000_000;

export const flyReplayMiddleware: RequestHandler = (request, response, next) => {
  const flyRequestId = request.headers["fly-request-id"];
  const flyClientId = request.headers["fly-client-id"];
  const replayable = request.headers["fly-replay"] === "true";

  if (typeof flyRequestId === "string") {
    response.setHeader("fly-request-id", flyRequestId);
  }
  if (typeof flyClientId === "string") {
    response.setHeader("fly-client-id", flyClientId);
  }
  if (replayable) {
    response.setHeader("fly-replay", "true");
  }

  const target = config.WRITE_REPLAY_REGION;
  const region = process.env.FLY_REGION;

  if (!target || !region || region === target) {
    next();
    return;
  }

  // Already replayed once (`fly-replay-src` is stamped by the proxy) or the
  // replay failed and the proxy handed the request back — replaying again
  // would loop.
  if (request.headers["fly-replay-src"] || request.headers["fly-replay-failed"]) {
    next();
    return;
  }

  if (!WRITE_METHODS.has(request.method)) {
    next();
    return;
  }

  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > REPLAYABLE_REQUEST_LIMIT) {
    // Rejected by the proxy anyway; handling it locally is the better failure.
    next();
    return;
  }

  response.setHeader(
    "fly-replay",
    `region=${target};timeout=10s;fallback=force_self`,
  );
  response.status(409).json({
    error: "Request replayed to the write region",
    code: "REPLAYED_TO_WRITE_REGION",
    replayTo: target,
    from: region,
  });
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Invalid request",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  // express marks body-parser failures with a `status`/`statusCode` property.
  const bodyError = error as { type?: string; status?: number; statusCode?: number };
  const bodyStatus = bodyError.status ?? bodyError.statusCode;

  if (bodyError.type === "entity.too.large" || bodyStatus === 413) {
    response.status(413).json({
      error: "Request body is too large",
      code: "PAYLOAD_TOO_LARGE",
    });
    return;
  }

  if (bodyError.type === "entity.parse.failed") {
    // Malformed JSON is a client mistake, not a server fault.
    response.status(400).json({
      error: "Request body is not valid JSON",
      code: "INVALID_JSON",
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Internal error";
  const code = message.split(":")[0] ?? message;

  if (message.startsWith("INVALID_TRANSITION")) {
    response.status(409).json({ error: "Invalid status transition", code: message });
    return;
  }

  const status = statusByCode[code];
  if (status) {
    response.status(status).json({ error: message, code });
    return;
  }

  logger.error(
    {
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack:
        error instanceof Error
          ? error.stack?.split("\n").slice(0, 6).join(" | ")
          : undefined,
      method: request.method,
      path: request.path,
      flyRequestId: request.headers["fly-request-id"],
    },
    "Unhandled request error",
  );
  response.status(500).json({ error: "Internal server error" });
};
