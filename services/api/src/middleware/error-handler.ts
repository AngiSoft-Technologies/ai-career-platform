import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";
import { redactError } from "../lib/redact.js";

const statusByCode: Record<string, number> = {
  PROFILE_NOT_FOUND: 404,
  OPPORTUNITY_NOT_FOUND: 404,
  APPLICATION_NOT_FOUND: 404,
  DOCUMENT_NOT_FOUND: 404,
  DOCUMENT_TYPE_CANNOT_BE_TAILORED: 400,
  AI_NOT_CONFIGURED: 503,
  TAILORING_INVALID_RESPONSE: 502,
  TAILORING_UNCHANGED: 502,
  VERSION_CONFLICT: 409,
  STORAGE_NOT_CONFIGURED: 503,
  UNSUPPORTED_DOCUMENT_TYPE: 400,
  BLUEPRINT_CREATE_FAILED: 500,
  APPLICATION_CREATE_FAILED: 500,
  DOCUMENT_CREATE_FAILED: 500,
  PREPARATION_NOT_FOUND: 404,
  PREPARATION_CREATE_FAILED: 500,
  PREPARATION_UPDATE_FAILED: 500,
  PREPARATION_NOT_READY: 409,
  PREPARATION_MISSING_INPUT: 409,
  PREPARATION_DOCUMENTS_MISSING: 409,
  PREPARATION_NOT_APPROVED: 409,
  PREPARATION_APPROVAL_STALE: 409,
  PREPARATION_INPUT_NOT_ALLOWED: 400,
  PREPARATION_SUPERSEDED: 409,
  PREPARATION_FIELD_MISSING: 409,
  PREPARATION_ANALYSIS_MISSING: 409,
  SUBMISSION_NOT_FOUND: 404,
  SUBMISSION_CREATE_FAILED: 500,
  SUBMISSION_NOT_RESUMABLE: 409,
  SUBMISSION_STEP_MISMATCH: 409,
  SUBMISSION_STEP_UNKNOWN: 500,
  SUBMISSION_CONSENT_REQUIRED: 400,
  BROWSER_AGENT_PAIRING_INVALID: 401,
  BROWSER_AGENT_REQUIRED: 409,
  BROWSER_AGENT_CREATE_FAILED: 500,
  GUIDANCE_SESSION_NOT_FOUND: 404,
  GUIDANCE_SESSION_CLOSED: 409,
  GUIDANCE_HINT_NOT_FOUND: 404,
  PLAYBOOK_STEPS_REQUIRED: 400,
  BROWSER_WORKSPACE_NOT_FOUND: 404,
};

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Not found" });
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

  // Error text can contain a SQL bind value (an email, a token) echoed back
  // by a driver. Use the shared redactor rather than logging `error` directly.
  logger.error(
    {
      error: redactError(error),
      method: request.method,
      path: request.path,
      requestId: request.headers["x-vercel-id"] ?? request.headers["x-request-id"],
    },
    "Unhandled request error",
  );
  response.status(500).json({ error: "Internal server error" });
};
