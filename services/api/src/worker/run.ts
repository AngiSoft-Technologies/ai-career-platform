import { startWorkers } from "./index.js";
import { logger } from "../logger.js";
import { pool } from "../db/pool.js";

async function main(): Promise<void> {
  const handle = await startWorkers();
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down worker");
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
    "Worker failed to start",
  );
  process.exit(1);
});
