import { server } from "./app.js";
import { config } from "./config.js";
import { pool, warmPool } from "./db/pool.js";
import { redis, startRedis, waitForRedis } from "./db/redis.js";
import { ensureRedisQueuePolicy } from "./db/redis-policy.js";
import { logger } from "./logger.js";
import { startServerTicker, type ServerTickerHandle } from "./lib/server-ticker.js";
import { serverStoreBackend, usesServerStore } from "./lib/server-store.js";
import { closeRealtime } from "./realtime/hub.js";
import { startGrpcServer, type GrpcHandle } from "./grpc/server.js";
import { startWorkers, type WorkerHandle } from "./worker/index.js";

/**
 * Process roles (PROCESS_ROLE):
 *   app    (default) HTTP + GraphQL + MCP + SSE + WebSocket + gRPC + workers
 *   api                HTTP + GraphQL + MCP + SSE + WebSocket + gRPC
 *   worker             background consumers only (scale-out replica)
 *
 * One entrypoint, one deploy. Nothing is started by hand.
 */
type ProcessRole = "app" | "api" | "worker";

const role = (process.env.PROCESS_ROLE ?? "app") as ProcessRole;

async function main(): Promise<void> {
  const startedAt = Date.now();
  let grpc: GrpcHandle | null = null;
  let workers: WorkerHandle | null = null;
  let serverTicker: ServerTickerHandle | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, role }, "Shutting down");
    if (role === "app" || role === "api") {
      server.close();
      await closeRealtime();
      if (grpc) await grpc.stop();
    }
    if (workers) await workers.stop();
    if (serverTicker) await serverTicker.stop();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  if (usesServerStore()) {
    logger.info(
      { backend: serverStoreBackend() },
      "Persistent server store active; Redis is not required on this host",
    );
  } else {
    startRedis();
    if (await waitForRedis()) {
      await ensureRedisQueuePolicy(redis);
    } else {
      logger.warn(
        "Redis was not connected at startup, so its eviction policy was not checked. BullMQ jobs are durable only when it is noeviction.",
      );
    }
  }

  const databaseReady = await warmPool();
  if (!databaseReady) {
    logger.error("Database is not reachable at startup");
    process.exit(1);
  }

  if (role === "app" || role === "api") {
    server.listen(config.PORT, () => {
      logger.info(
        { port: config.PORT, env: config.NODE_ENV, role },
        "mboqara API listening",
      );
    });

    grpc = await startGrpcServer();
  }

  if (role === "app" || role === "worker") {
    if (usesServerStore()) {
      // Production server: SQLite + JSONL own the queue, cache, automations
      // and tick leases. BullMQ/Redis remain the Vercel/Redis-backed path.
      serverTicker = await startServerTicker();
      if (!serverTicker) {
        workers = await startWorkers();
      }
    } else {
      workers = await startWorkers();
    }
  }

  logger.info(
    { role, bootMs: Date.now() - startedAt },
    "mboqara backend ready",
  );
}

main().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Backend failed to start",
  );
  process.exit(1);
});
