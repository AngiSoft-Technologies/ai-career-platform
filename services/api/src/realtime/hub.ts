import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { EventEnvelope, RealtimeEvent } from "@angisoft/job-radar-contracts";
import { resolveIdentity } from "../auth/resolve-identity.js";
import { logger } from "../logger.js";

let wss: WebSocketServer | null = null;
const alive = new WeakMap<WebSocket, boolean>();
const socketUsers = new WeakMap<WebSocket, string>();
const WEBSOCKET_PATHS = new Set(["/ws", "/v1/ws"]);

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function attachRealtime(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const path = new URL(
      request.url ?? "/",
      "http://localhost",
    ).pathname.replace(/\/$/, "");

    if (!WEBSOCKET_PATHS.has(path)) {
      socket.destroy();
      return;
    }

    wss?.handleUpgrade(request, socket, head, (client) => {
      wss?.emit("connection", client, request);
    });
  });

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/ws", "http://localhost");
    const token = url.searchParams.get("token") ?? undefined;
    const authorization = request.headers.authorization;
    const headerUserId = url.searchParams.get("userId");

    void resolveIdentity({
      authorization: token ? `Bearer ${token}` : authorization,
      headerUserId,
    })
      .then((identity) => {
        socketUsers.set(socket, identity.userId);
        alive.set(socket, true);
        socket.on("pong", () => alive.set(socket, true));
        socket.on("message", (raw) => {
          try {
            const message = JSON.parse(raw.toString()) as { type?: string };
            if (message.type === "ping") send(socket, { type: "pong" });
          } catch {
            send(socket, { type: "error", error: "Invalid JSON" });
          }
        });
        socket.on("close", () => alive.delete(socket));

        send(socket, {
          type: "connected",
          userId: identity.userId,
          authenticated: identity.authenticated,
          at: new Date().toISOString(),
        });
      })
      .catch(() => {
        socket.close(1008, "Unauthorized");
      });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss?.clients ?? []) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, 30_000);

  wss.on("close", () => clearInterval(heartbeat));
  logger.info("WebSocket hub listening at /ws");
}

export function broadcast<T>(
  type: RealtimeEvent["type"],
  data: T,
  userId?: string,
): EventEnvelope<T> {
  const event: EventEnvelope<T> = {
    id: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    data,
  };

  for (const socket of wss?.clients ?? []) {
    if (userId && socketUsers.get(socket) !== userId) continue;
    send(socket, event);
  }

  return event;
}

export async function closeRealtime(): Promise<void> {
  if (!wss) return;
  for (const socket of wss.clients) socket.close(1001, "Server shutting down");
  await new Promise<void>((resolve) => wss?.close(() => resolve()));
  wss = null;
}
