import pg from "pg";
import { config } from "../config.js";

const connectionString =
  config.DIRECT_DATABASE_URL ??
  config.DATABASE_URL_UNPOOLED ??
  config.DATABASE_URL;

const pool = new pg.Pool({ connectionString, max: 1 });

function authBaseUrl(): string {
  if (!config.NEON_AUTH_BASE_URL) {
    throw new Error("NEON_AUTH_BASE_URL is required");
  }
  return config.NEON_AUTH_BASE_URL.replace(/\/$/, "");
}

function requestOrigin(): string {
  return config.INVITE_BASE_URL ?? config.WEB_ORIGINS[0] ?? "http://localhost:3000";
}

async function authPost(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${authBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: requestOrigin(),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function main(): Promise<void> {
  const email = config.INVITE_SERVICE_EMAIL;
  const password = config.INVITE_SERVICE_PASSWORD;
  if (!email || !password) {
    throw new Error("INVITE_SERVICE_EMAIL and INVITE_SERVICE_PASSWORD are required");
  }

  let created = false;
  try {
    await authPost("/sign-up/email", { email, password, name: "Invitation Service" });
    created = true;
    console.log(`created invitation service account ${email}`);
  } catch {
    await authPost("/sign-in/email", { email, password });
    console.log(`invitation service account ${email} already exists`);
  }

  const result = await pool.query(
    `UPDATE neon_auth."user" SET role = 'admin' WHERE lower(email) = lower($1) RETURNING id, email, role`,
    [email],
  );
  if (result.rowCount === 0) {
    throw new Error(`invitation service account ${email} was not found in the auth directory`);
  }

  console.log("invitation service account ready:", result.rows[0], { created });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
