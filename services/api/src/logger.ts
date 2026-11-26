import pino from "pino";
import { config } from "./config.js";

/**
 * Structured logs must never become a second copy of the credential store or
 * the user directory. Pino's redaction runs on every child logger too, so
 * `logger.child({...})` call sites get the same protection as the root.
 */
export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  base: { service: "mboqara-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "req.headers['x-auth-token']",
      "res.headers['set-cookie']",
      "authorization",
      "authorizationHeader",
      "cookie",
      "token",
      "token_hash",
      "tokenCiphertext",
      "accessToken",
      "refreshToken",
      "password",
      "apiKey",
      "secret",
      "email",
      "*.email",
      "*.authorization",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
});
