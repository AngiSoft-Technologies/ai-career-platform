import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  base: { service: "job-radar-api" },
});
