import { createServer } from "node:http";
import { app } from "./app.js";
import { config } from "./config.js";
import { pool, warmPool } from "./db/pool.js";
import { redis, startRedis, waitForRedis } from "./db/redis.js";
import { ensureRedisQueuePolicy } from "./db/redis-policy.js";
import { logger } from "./logger.js";
import { attachRealtime, closeRealtime } from "./realtime/hub.js";
import { startGrpcServer, type GrpcHandle } from "./grpc/server.js";
import { startWorkers, type WorkerHandle } from "./worker/index.js";

/**
 * Process roles:
 *   app    (default) HTTP + GraphQL + MCP + SSE + WebSocket + gRPC + workers
 *   api                HTTP + GraphQL + MCP + SSE + WebSocket + gRPC
 *   worker             background consumers only (scale-out replica)
 *
 * One image, one entrypoint, one `fly deploy`. Nothing is started by hand.
 */
type ProcessRole = "app" | "api" | "worker";

const role = (process.env.PROCESS_ROLE ?? "app") as ProcessRole;

async function main(): Promise<void> {
  const startedAt = Date.now();
  let grpc: GrpcHandle | null = null;
  let workers: WorkerHandle | null = null;

  startRedis();
  if (await waitForRedis()) {
    await ensureRedisQueuePolicy(redis);
  }

  const databaseReady = await warmPool();
  if (!databaseReady) {
    logger.error("Database is not reachable at startup");
    process.exit(1);
  }

  if (role === "app" || role === "api") {
    const server = createServer(app);
    attachRealtime(server);

    server.listen(config.PORT, () => {
      logger.info(
        { port: config.PORT, env: config.NODE_ENV, role },
        "Job Radar API listening",
      );
    });

    const shutdownHttp = async (signal: string): Promise<void> => {
      logger.info({ signal }, "Shutting down");
      server.close();
      await closeRealtime();
      if (grpc) await grpc.stop();
      if (workers) await workers.stop();
      redis.disconnect();
      await pool.end();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdownHttp("SIGINT"));
    process.on("SIGTERM", () => void shutdownHttp("SIGTERM"));

    grpc = await startGrpcServer();
  }

  if (role === "app" || role === "worker") {
    workers = await startWorkers();
  }

  logger.info(
    { role, bootMs: Date.now() - startedAt },
    "Job Radar backend ready",
  );
}

main().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Backend failed to start",
  );
  process.exit(1);
});
