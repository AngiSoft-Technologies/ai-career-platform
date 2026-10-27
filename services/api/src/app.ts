import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { createYoga } from "graphql-yoga";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { resolveIdentity } from "./auth/resolve-identity.js";
import { config } from "./config.js";
import { healthCheck } from "./db/pool.js";
import { redis } from "./db/redis.js";
import { schema } from "./graphql/schema.js";
import { logger } from "./logger.js";
import {
  errorHandler,
  flyReplayMiddleware,
  notFoundHandler,
} from "./middleware/error-handler.js";
import { identity } from "./middleware/identity.js";
import { mcpRouter } from "./routes/mcp.js";
import { metricsRouter, recordHttpRequest } from "./routes/metrics.js";
import { statsRouter } from "./routes/stats.js";
import { publicRouter } from "./routes/public.js";
import { contentRouter } from "./routes/content.js";
import { invitationRouter } from "./routes/invitations.js";
import { v1Router } from "./routes/v1.js";
import { webhookRouter } from "./routes/webhooks.js";
import { API_VERSION, API_VERSION_HEADER } from "./version.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.WEB_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use("/v1/webhooks", webhookRouter);
app.use("/api/v1/webhooks", webhookRouter);
app.use(express.json({ limit: "2mb" }));
app.use((_request, response, next) => {
  response.setHeader(API_VERSION_HEADER, API_VERSION);
  next();
});
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (request) =>
      request.path === "/health" ||
      request.path === "/live" ||
      request.path === "/v1/health",
  }),
);
app.use(
  pinoHttp({
    logger,
    genReqId: (request, response) => {
      const id =
        (request.headers["x-request-id"] as string | undefined) ?? randomUUID();
      response.setHeader("x-request-id", id);
      return id;
    },
    customLogLevel: (_request, response) => {
      const status = response.statusCode;
      if (status >= 500) return "error";
      if (status >= 400) return "warn";
      return "info";
    },
  }),
);

app.use((request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route =
      (request.route?.path as string | undefined) ??
      request.path.replace(/\/[0-9a-f-]{16,}/gi, "/:id");
    recordHttpRequest(
      request.method,
      route,
      response.statusCode,
      durationMs,
    );
  });
  next();
});

function buildYoga(endpoint: string) {
  return createYoga({
    schema,
    graphqlEndpoint: endpoint,
    cors: false,
    context: async ({ request }) => {
      const resolved = await resolveIdentity({
        authorization: request.headers.get("authorization"),
        headerUserId: request.headers.get("x-user-id"),
      });
      return { userId: resolved.userId };
    },
  });
}

app.get("/live", (_request, response) => {
  response.json({
    status: "ok",
    service: "job-radar-api",
    apiVersion: API_VERSION,
  });
});

app.get(["/health", "/v1/health"], async (_request, response) => {
  try {
    const database = await healthCheck();
    response.status(database ? 200 : 503).json({
      status: database ? "ok" : "degraded",
      database,
      cache: redis.status,
      apiVersion: API_VERSION,
      timestamp: new Date().toISOString(),
    });
  } catch {
    response.status(503).json({ status: "degraded", database: false });
  }
});

app.use("/v1/graphql", buildYoga("/v1/graphql"));
app.use("/graphql", buildYoga("/graphql"));

const mcpResourcePath = "/v1/mcp";
const mcpResource = `${config.API_URL.replace(/\/$/, "")}${mcpResourcePath}`;
const mcpResourceMetadata = `${config.API_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource${mcpResourcePath}`;
const mcpAuthorizationServer = config.NEON_AUTH_BASE_URL?.replace(/\/$/, "");

const protectedResource = (resource: string) => ({
  resource,
  authorization_servers: mcpAuthorizationServer ? [mcpAuthorizationServer] : [],
  scopes_supported: ["openid", "profile", "email", "offline_access"],
  bearer_methods_supported: ["header"],
  resource_name: "Job Radar",
});

app.get("/.well-known/oauth-protected-resource/v1/mcp", (_request, response) => {
  response.json(protectedResource(mcpResource));
});

app.get("/.well-known/oauth-protected-resource/mcp", (_request, response) => {
  response.json(
    protectedResource(`${config.API_URL.replace(/\/$/, "")}/mcp`),
  );
});

app.use([mcpResourcePath, "/mcp"], (_request, response, next) => {
  const sendJson = response.json.bind(response);
  response.json = ((body: unknown) => {
    if (response.statusCode === 401 && !response.getHeader("WWW-Authenticate")) {
      response.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${mcpResourceMetadata}"`,
      );
    }
    return sendJson(body);
  }) as typeof response.json;
  next();
});

app.use(metricsRouter);
// Public, cacheable aggregate counters for the marketing site. Mounted before
// identity because it must not require a session.
app.use("/v1/stats", statsRouter);
app.use("/api/v1/stats", statsRouter);
app.use("/v1/public", publicRouter);
app.use("/api/v1/public", publicRouter);
app.use("/v1/invitations", invitationRouter);
app.use("/api/v1/invitations", invitationRouter);
app.use("/v1/content", contentRouter);
app.use("/api/v1/content", contentRouter);
app.use(flyReplayMiddleware);

app.use(identity);
app.use("/v1/mcp", mcpRouter);
app.use("/mcp", mcpRouter);
app.use("/v1", v1Router);
app.use("/api/v1", v1Router);

app.use(notFoundHandler);
app.use(errorHandler);
