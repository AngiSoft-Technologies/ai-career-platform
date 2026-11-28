/**
 * JSONL tick/automation log for a persistent production backend.
 *
 * SQLite is the indexed store; this file is the append-only record. Every
 * lease claim, release, dispatch, enqueue, ack, failure, cache write and
 * automation is one JSON line, so replaying it reconstructs what happened even
 * after a restart.
 *
 * Vercel never uses this store — function filesystems are ephemeral. The
 * serverless path keeps Redis/Neon. Set SERVER_STATE_BACKEND=jsonl (or
 * sqlite+jsonl) on a persistent host and SERVER_STATE_FILE to choose the path.
 */

import { readFileSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type JsonlEventType =
  | "claim"
  | "release"
  | "dispatch"
  | "enqueue"
  | "ack"
  | "fail"
  | "cache"
  | "automation";

export interface TickEvent {
  at: number;
  type: JsonlEventType;
  name: string;
  token?: string;
  expiresAt?: number;
  boundary?: number;
  payload?: unknown;
}

interface Lease {
  token: string;
  expiresAt: number;
}

const filePath = () =>
  resolve(process.env.SERVER_STATE_FILE ?? ".data/server.jsonl");

let writeQueue: Promise<void> = Promise.resolve();

export async function appendJsonlEvent(event: TickEvent): Promise<void> {
  const path = filePath();
  const line = `${JSON.stringify(event)}\n`;
  // A failed write must not poison every later event in the chain.
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line, "utf8");
  });
  await writeQueue;
}

async function readEvents(): Promise<TickEvent[]> {
  try {
    const text = await readFile(filePath(), "utf8");
    const events: TickEvent[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as TickEvent;
        if (
          parsed &&
          typeof parsed.at === "number" &&
          typeof parsed.type === "string" &&
          typeof parsed.name === "string"
        ) {
          events.push(parsed);
        }
      } catch {
        // A torn final line is harmless: the next append continues after it.
      }
    }
    return events;
  } catch {
    return [];
  }
}

export function jsonlTickStoreEnabled(): boolean {
  return (
    (process.env.SERVER_STATE_BACKEND === "jsonl" ||
      process.env.SERVER_STATE_BACKEND === "sqlite+jsonl") &&
    process.env.VERCEL !== "1"
  );
}

/**
 * Claims a lease by replaying the log. An expired claim is free for the
 * taking; a live claim held by a different token is not.
 */
export async function claimJsonlTick(
  name: string,
  ttlSeconds: number,
  token: string,
): Promise<boolean> {
  const events = await readEvents();
  const now = Date.now();
  let current: Lease | null = null;

  for (const event of events) {
    if (event.name !== name) continue;
    if (event.type === "claim" && event.token) {
      current = {
        token: event.token,
        expiresAt: event.expiresAt ?? event.at + ttlSeconds * 1000,
      };
    } else if (event.type === "release" && event.token === current?.token) {
      current = null;
    }
  }

  if (current && current.expiresAt > now) return false;

  await appendJsonlEvent({
    at: now,
    type: "claim",
    name,
    token,
    expiresAt: now + ttlSeconds * 1000,
  });
  return true;
}

export async function releaseJsonlTick(name: string, token: string): Promise<void> {
  await appendJsonlEvent({ at: Date.now(), type: "release", name, token });
}

export async function recordJsonlDispatch(name: string, boundary: number): Promise<void> {
  await appendJsonlEvent({ at: Date.now(), type: "dispatch", name, boundary });
}

/** Last dispatch boundaries, replayed synchronously when the ticker starts. */
export function loadJsonlDispatches(): Map<string, number> {
  const result = new Map<string, number>();
  try {
    const text = readFileSync(filePath(), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as TickEvent;
        if (
          event.type === "dispatch" &&
          typeof event.boundary === "number" &&
          typeof event.name === "string"
        ) {
          result.set(event.name, Math.max(result.get(event.name) ?? 0, event.boundary));
        }
      } catch {
        // Ignore torn lines.
      }
    }
  } catch {
    return result;
  }
  return result;
}
