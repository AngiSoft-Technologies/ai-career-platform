import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const repositoryRoot = resolve(process.cwd(), "../..");
dotenv.config({ path: resolve(repositoryRoot, ".env.local") });
dotenv.config({ path: resolve(repositoryRoot, ".env") });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8088),
  API_URL: z.string().default("http://localhost:8088"),
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:3000,http://localhost:3100"),
  DATABASE_URL: z
    .string()
    .default("postgresql://jobradar:jobradar@localhost:5432/jobradar"),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("uploads"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  AWS_ENDPOINT_URL_S3: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  NEON_AUTH_BASE_URL: z.string().url().optional(),
  NEON_AUTH_JWKS_URL: z.string().url().optional(),
  NEON_REALTIME_URL: z.string().optional(),
  NEON_AI_GATEWAY_BASE_URL: z.string().url().optional(),
  NEON_AI_GATEWAY_TOKEN: z.string().optional(),
  INVITE_SERVICE_EMAIL: z.string().email().optional(),
  INVITE_SERVICE_PASSWORD: z.string().optional(),
  INVITE_BASE_URL: z.string().url().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  MATCHING_GRPC_URL: z.string().optional(),
  DEMO_USER_ID: z
    .string()
    .uuid()
    .default("00000000-0000-0000-0000-000000000001"),
  JWT_SECRET: z.string().default("job-radar-development-secret"),
  DEMO_MODE: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4.1-mini"),
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_PROVIDER: z
    .enum(["auto", "neon", "nvidia", "openai", "custom"])
    .default("auto"),
  AI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  NEON_AI_MODEL: z.string().default("openai/gpt-4.1-mini"),
  NEON_AI_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z
    .string()
    .url()
    .default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_MODEL: z.string().default("nvidia/llama-3.1-nemotron-70b-instruct"),
  NVIDIA_EMBEDDING_MODEL: z
    .string()
    .default("nvidia/llama-3.2-nv-embedqa-1b-v2"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  JOB_SOURCE_FETCH_LIMIT: z.coerce.number().int().positive().default(100),
});

const parsed = schema.parse(process.env);

export const config = {
  ...parsed,
  WEB_ORIGINS: parsed.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  DEMO_MODE:
    parsed.DEMO_MODE === undefined
      ? parsed.NODE_ENV !== "production"
      : parsed.DEMO_MODE !== "false",
};
