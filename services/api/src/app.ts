import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { createYoga } from "graphql-yoga";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { resolveIdentity } from "./auth/resolve-identity.js";
import { config } from "./config.js";
import { healthCheck } from "./db/pool.js";
import { redis, startRedis, waitForRedis } from "./db/redis.js";
import { ensureRedisQueuePolicy } from "./db/redis-policy.js";
import { serverStoreBackend, usesServerStore } from "./lib/server-store.js";
import { schema } from "./graphql/schema.js";
import { logger } from "./logger.js";
import { redactError, redactHeaders, redactUrl } from "./lib/redact.js";
import { tickerStatus } from "./lib/ticker.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.js";
import { identity } from "./middleware/identity.js";
import { attachRealtime } from "./realtime/hub.js";
import { mcpRouter } from "./routes/mcp.js";
import { metricsRouter, recordHttpRequest } from "./routes/metrics.js";
import { statsRouter } from "./routes/stats.js";
import { publicRouter } from "./routes/public.js";
import { reviewsRouter } from "./routes/reviews.js";
import { contentRouter } from "./routes/content.js";
import { publicConfigRouter } from "./routes/platform.js";
import { invitationRouter } from "./routes/invitations.js";
import { v1Router } from "./routes/v1.js";
import { authRouter } from "./routes/auth.js";
import { webhookEndpointRouter } from "./routes/webhook-endpoints.js";
import { n8nRouter } from "./routes/n8n.js";
import { agentRouter } from "./routes/agent.js";
import { internalRouter } from "./routes/internal.js";
import { API_VERSION, API_VERSION_HEADER } from "./version.js";

export const app = express();

// Vercel's zero-config Express support detects this file as the function
// entry. The default export at the bottom is an HTTP *server* with the
// realtime upgrade handler attached — exporting the bare Express app makes
// Vercel treat /v1/ws as an ordinary GET, so the WebSocket handshake never
// reaches the hub. The standalone server entry stays src/index.ts, which
// also starts gRPC, workers and the ticker — none of which can run inside
// a serverless function.

// index.ts owns process startup (gRPC, workers, ticker), which never runs on
// serverless. Vercel still needs Redis for cache, queues and pub/sub. A
// persistent production backend uses the SQLite+JSONL store instead, so it
// must not open a Redis client it does not need.
if (!usesServerStore()) {
  startRedis();
  void waitForRedis().then((connected) => {
    if (connected) void ensureRedisQueuePolicy(redis).catch(() => {});
  });
}

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
    // The default HTTP serializers echo every request header (including
    // Authorization) and the raw URL (including token query parameters).
    serializers: {
      req: (request) => ({
        id: typeof request.headers["x-request-id"] === "string"
          ? request.headers["x-request-id"]
          : undefined,
        method: request.method,
        url: redactUrl(request.originalUrl ?? request.url ?? ""),
        headers: redactHeaders(request.headers),
      }),
      // Pino hands a response serializer the response it has already
      // reduced, not the live `ServerResponse`, so there are no raw headers
      // to read here. Only the status is logged; the request headers above
      // are the ones that can carry a credential.
      res: (response) => ({
        statusCode: response.statusCode,
      }),
      err: (error: Error) => redactError(error),
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
  const ticker = tickerStatus();
  response.json({
    status: "ok",
    service: "mboqara-api",
    apiVersion: API_VERSION,
    // A stopped clock is a silent failure of every periodic job, so the
    // liveness payload says when it last ticked.
    ticker: ticker
      ? {
          running: true,
          intervalMs: ticker.intervalMs,
          ticks: ticker.ticks,
          lastTickAt: ticker.lastTickAt
            ? new Date(ticker.lastTickAt).toISOString()
            : null,
        }
      : { running: false },
  });
});

app.get(["/health", "/v1/health"], async (_request, response) => {
  try {
    const database = await healthCheck();
    const store = serverStoreBackend();
    response.status(database ? 200 : 503).json({
      status: database ? "ok" : "degraded",
      database,
      cache: store === "redis" ? redis.status : store,
      store,
      apiVersion: API_VERSION,
      ticker: tickerStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    response.status(503).json({ status: "degraded", database: false });
  }
});

app.get("/", async (_request, response) => {
  let database = false;
  try {
    database = await healthCheck();
  } catch {
    database = false;
  }
  const ok = database;
  const store = serverStoreBackend();
  const rows: Array<[string, string]> = [
    ["Service", "mboqara-api"],
    ["Status", ok ? "operational" : "degraded"],
    ["Database", database ? "connected" : "unreachable"],
    ["Cache", store === "redis" ? redis.status : store],
    ["API version", API_VERSION],
    ["Time", new Date().toISOString()],
  ];
  const body = rows
    .map(
      ([key, value]) =>
        `<tr><th style="text-align:left;padding:4px 16px 4px 0">${key}</th><td>${value}</td></tr>`,
    )
    .join("");
  response
    .status(ok ? 200 : 503)
    .type("html")
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mboqara-api</title><style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#111}h1{font-size:1.4rem}table{border-collapse:collapse;font-size:.95rem}th{font-weight:600;color:#555}</style></head><body><h1>MboQara API</h1><table>${body}</table><p><a href="/v1/health">/v1/health</a> · <a href="/live">/live</a></p></body></html>`,
    );
});

app.use("/v1/graphql", buildYoga("/v1/graphql"));
app.use("/graphql", buildYoga("/graphql"));

const mcpResourcePath = "/v1/mcp";
const mcpResource = `${config.API_URL.replace(/\/$/, "")}${mcpResourcePath}`;
const mcpResourceMetadata = `${config.API_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource${mcpResourcePath}`;

const protectedResource = (resource: string) => ({
  resource,
  authorization_servers: [],
  scopes_supported: ["openid", "profile", "email", "offline_access"],
  bearer_methods_supported: ["header"],
  resource_name: "mboqara",
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
app.use("/v1/reviews", reviewsRouter);
app.use("/v1/public", publicRouter);

app.use("/api/v1/reviews", reviewsRouter);
app.use("/api/v1/public", publicRouter);
app.use("/v1/invitations", invitationRouter);
app.use("/api/v1/invitations", invitationRouter);
app.use("/v1/content", contentRouter);
app.use("/api/v1/content", contentRouter);
// Client bootstrap config is public and must resolve before `identity`.
app.use("/v1/config", publicConfigRouter);
app.use("/api/v1/config", publicConfigRouter);
app.use("/v1/n8n", n8nRouter);
app.use("/api/v1/n8n", n8nRouter);

/**
 * Auth is mounted before identity on purpose.
 *
 * Identity rejects requests that carry no token, which is correct for every
 * resource — but the auth endpoints are how a client *gets* a token, so they
 * have to be reachable without one. The auth router resolves the caller itself
 * and only rejects where a session is genuinely required.
 */
app.use("/v1/auth", authRouter);
app.use("/api/v1/auth", authRouter);

app.use("/v1/agent", agentRouter);
app.use("/api/v1/agent", agentRouter);
app.use("/internal", internalRouter);

app.use(identity);
app.use("/v1/mcp", mcpRouter);
app.use("/mcp", mcpRouter);
// Outbound webhook management. Mounted after `identity` because every route
// is scoped to the calling user.
app.use("/v1/webhook-endpoints", webhookEndpointRouter);
app.use("/api/v1/webhook-endpoints", webhookEndpointRouter);
app.use("/v1", v1Router);
app.use("/api/v1", v1Router);

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Vercel needs the default export to be a Node HTTP server when the app serves
 * WebSockets (https://vercel.com/docs/functions/websockets). Attaching the hub
 * here means both the serverless function and the standalone server in
 * src/index.ts serve the same /ws and /v1/ws upgrade path.
 */
export const server = createServer(app);
attachRealtime(server);
export default server;
