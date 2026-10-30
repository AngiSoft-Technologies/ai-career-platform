#!/usr/bin/env node
/**
 * Proves the notification path is wired end to end.
 *
 * Run against a local API (the one that writes your database):
 *
 *   node services/api/scripts/verify-notifications.mjs http://127.0.0.1:8091/v1
 *
 * It signs up a throwaway user, performs a real write that should notify
 * (tracking an application), then reads the notification back through the
 * public API, marks it read, and confirms the unread count reached zero.
 *
 * Sign-up is rate limited (5/hour/IP), so repeated runs need an API restart.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8091/v1").replace(/\/+$/, "");

function databaseUrl() {
  const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
  const match = env.match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error("DATABASE_URL not found in .env.local");
  return match[1].replace(/^["']|["']$/g, "");
}

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

const client = new Client({ connectionString: databaseUrl() });
await client.connect();

try {
  const email = `notify-${randomUUID()}@example.test`;
  const signUp = await call("/auth/sign-up", {
    method: "POST",
    body: { name: "Notification Probe", email, password: "Probe-passw0rd!" },
  });
  check("sign-up succeeds", signUp.status === 201 || signUp.status === 200, `status ${signUp.status} ${signUp.text.slice(0, 160)}`);
  const token = signUp.json?.token;
  if (!token) throw new Error(`no token in sign-up response: ${signUp.text.slice(0, 200)}`);

  const opportunity = await client.query(
    `SELECT id FROM opportunities WHERE status = 'active' ORDER BY posted_at DESC NULLS LAST LIMIT 1`,
  );
  const opportunityId = opportunity.rows[0]?.id;
  if (!opportunityId) throw new Error("no active opportunity to attach an application to");

  const empty = await call("/me/notifications", { token });
  check("a new user starts with an empty inbox", empty.status === 200 && (empty.json?.items?.length ?? -1) === 0, JSON.stringify(empty.json));

  const created = await call("/applications", {
    method: "POST",
    token,
    body: { opportunityId },
  });
  check("tracking an application succeeds", created.status === 201, `status ${created.status} ${created.text.slice(0, 160)}`);

  const inbox = await call("/me/notifications", { token });
  const items = inbox.json?.items ?? [];
  const notification = items.find((item) => item.type === "application");
  check("the application produced a server notification", Boolean(notification), JSON.stringify(inbox.json).slice(0, 240));
  check("the unread count reflects it", (inbox.json?.unreadCount ?? 0) >= 1, String(inbox.json?.unreadCount));
  check("the notification is unread", notification?.isRead === false, String(notification?.isRead));

  const status = await call(`/applications/${created.json.application.id}/status`, {
    method: "PATCH",
    token,
    body: {
      status: "ANALYZED",
      version: created.json.application.version ?? 1,
    },
  });
  check("changing status succeeds", status.status === 200, `status ${status.status} ${status.text.slice(0, 160)}`);

  const afterStatus = await call("/me/notifications", { token });
  const moved = (afterStatus.json?.items ?? []).find((item) =>
    String(item.title).toLowerCase().includes("analyzed"),
  );
  check("the status change produced its own notification", Boolean(moved), JSON.stringify(afterStatus.json).slice(0, 240));
  check("unread count grew", (afterStatus.json?.unreadCount ?? 0) >= 2, String(afterStatus.json?.unreadCount));

  const read = await call("/me/notifications/read", { method: "POST", token });
  check("mark-all-read succeeds", read.status === 200, `status ${read.status}`);

  const count = await call("/me/notifications/unread-count", { token });
  check("unread count is zero afterwards", count.json?.unreadCount === 0, JSON.stringify(count.json));

  const reread = await call("/me/notifications", { token });
  check(
    "every item is now read",
    (reread.json?.items ?? []).every((item) => item.isRead === true) &&
      (reread.json?.items?.length ?? 0) >= 2,
    JSON.stringify(reread.json).slice(0, 240),
  );

  const anonymous = await call("/me/notifications");
  check("the inbox requires authentication", anonymous.status === 401, `status ${anonymous.status}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
} catch (error) {
  console.error(`\nVerification could not run: ${error.message}\n`);
  failed += 1;
} finally {
  await client.end();
}

process.exit(failed === 0 ? 0 : 1);
