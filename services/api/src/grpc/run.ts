import { startGrpcServer } from "./server.js";
import { logger } from "../logger.js";
import { pool } from "../db/pool.js";

async function main(): Promise<void> {
  const handle = await startGrpcServer();
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down gRPC");
    await handle.stop();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "gRPC server failed to start",
  );
  process.exit(1);
});
