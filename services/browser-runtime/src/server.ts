import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { assertConfigured, config } from "./config.js";
import { HttpError } from "./errors.js";
import {
  createSession,
  deleteSession,
  getSession,
  sessionCount,
} from "./session.js";
import { commandSchema, sessionSchema } from "./types.js";

type AsyncHandler = (request: Request, response: Response) => void | Promise<void>;

function route(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    Promise.resolve(handler(request, response)).catch(next);
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "INVALID_REQUEST", "The request body is not valid");
  }
  return result.data;
}

function bearer(request: Request): string | null {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function sessionId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function requireAuth(allowBodyToken = false) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const fromHeader = bearer(request);
    const fromBody =
      allowBodyToken && typeof request.body?.token === "string" ? request.body.token : null;
    if (fromHeader && fromBody && fromHeader !== fromBody) {
      next(new HttpError(401, "UNAUTHORIZED", "Runtime credentials do not match"));
      return;
    }
    const presented = fromHeader ?? fromBody;
    if (!presented || presented !== config.token) {
      next(new HttpError(401, "UNAUTHORIZED", "A valid runtime token is required"));
      return;
    }
    next();
  };
}

export function createApp() {
  assertConfigured();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20mb" }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  // Health is deliberately unauthenticated so orchestration can probe the
  // container without holding a runtime secret.
  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      sessions: sessionCount(),
      maxSessions: config.maxSessions,
    });
  });

  app.post(
    "/sessions",
    requireAuth(true),
    route(async (request, response) => {
      const input = parse(sessionSchema, request.body);
      const session = await createSession({
        applicationId: input.applicationId,
        guidanceSessionId: input.guidanceSessionId,
        targetUrl: input.targetUrl,
      });
      response.status(201).json({
        id: session.id,
        applicationId: session.applicationId,
        guidanceSessionId: session.guidanceSessionId,
        targetUrl: session.targetUrl,
        status: "READY",
        streamPath: `/sessions/${session.id}/frame`,
        statePath: `/sessions/${session.id}/state`,
        createdAt: session.createdAt,
      });
    }),
  );

  app.get(
    "/sessions/:id/frame",
    requireAuth(),
    route(async (request, response) => {
      const frame = await getSession(sessionId(request)).frame();
      response.setHeader("Content-Type", "image/jpeg");
      response.setHeader("Content-Length", String(frame.length));
      response.end(frame);
    }),
  );

  app.get(
    "/sessions/:id/state",
    requireAuth(),
    route(async (request, response) => {
      response.json(await getSession(sessionId(request)).state());
    }),
  );

  app.post(
    "/sessions/:id/command",
    requireAuth(),
    route(async (request, response) => {
      const command = parse(commandSchema, request.body);
      const result = await getSession(sessionId(request)).execute(command);
      response.json({ ok: true, result });
    }),
  );

  app.delete(
    "/sessions/:id",
    requireAuth(),
    route(async (request, response) => {
      const closed = await deleteSession(sessionId(request));
      if (!closed) throw new HttpError(404, "SESSION_NOT_FOUND", "Browser session not found");
      response.status(204).end();
    }),
  );

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found", code: "NOT_FOUND" });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      if (error.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
      response.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    // Never send stacks or upstream error bodies to a caller.
    console.error("[browser-runtime] unhandled error", error);
    response.status(500).json({ error: "Browser runtime failed", code: "INTERNAL_ERROR" });
  });

  return app;
}
