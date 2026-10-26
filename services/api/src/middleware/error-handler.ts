import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";

const statusByCode: Record<string, number> = {
  PROFILE_NOT_FOUND: 404,
  OPPORTUNITY_NOT_FOUND: 404,
  APPLICATION_NOT_FOUND: 404,
  DOCUMENT_NOT_FOUND: 404,
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
 */
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

  next();
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
