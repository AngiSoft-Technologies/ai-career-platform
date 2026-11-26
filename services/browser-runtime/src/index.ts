import { createApp } from "./server.js";
import { config } from "./config.js";
import { shutdown } from "./session.js";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[browser-runtime] listening on http://0.0.0.0:${config.port}`);
});

async function stop(signal: string): Promise<void> {
  console.log(`[browser-runtime] received ${signal}, closing browser sessions`);
  server.close();
  await shutdown();
  process.exit(0);
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
