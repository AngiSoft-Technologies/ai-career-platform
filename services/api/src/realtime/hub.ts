import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { EventEnvelope, RealtimeEvent } from "@angisoft/mboqara-contracts";
import { resolveIdentity } from "../auth/resolve-identity.js";
import { logger } from "../logger.js";

let wss: WebSocketServer | null = null;
const alive = new WeakMap<WebSocket, boolean>();
const socketUsers = new WeakMap<WebSocket, string>();
const WEBSOCKET_PATHS = new Set(["/ws", "/v1/ws"]);

/**
 * How a browser proves who it is on a WebSocket.
 *
 * A browser cannot set a request header on a WebSocket — the constructor
 * takes a URL and a list of subprotocols, nothing else. The token used to
 * travel in the query string instead, which is the one place a credential is
 * guaranteed to end up: in the proxy's access log, in the load balancer's
 * log, in the URL of any error report.
 *
 * So the token goes in a subprotocol instead:
 *
 *     new WebSocket(url, [`authorization.bearer.${token}`])
 *
 * The server has to name the protocol it accepted in its response, and the
 * browser checks that it matches one of the ones it offered. The token is
 * therefore visible in the handshake response too, which is not a new
 * exposure: the browser already had it.
 *
 * A native client can and does send the `Authorization` header, and that
 * path is kept for it.
 */
const WS_TOKEN_PROTOCOL_PREFIX = "authorization.bearer.";

function protocolToken(protocols: string[]): string | undefined {
  for (const protocol of protocols) {
    if (protocol.startsWith(WS_TOKEN_PROTOCOL_PREFIX)) {
      return protocol.slice(WS_TOKEN_PROTOCOL_PREFIX.length).trim() || undefined;
    }
  }
  return undefined;
}

function offeredProtocols(request: { headers: Record<string, unknown> }): string[] {
  const raw = request.headers["sec-websocket-protocol"];
  if (typeof raw === "string") {
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((value) =>
      typeof value === "string"
        ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
        : [],
    );
  }
  return [];
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function attachRealtime(server: Server): void {
  wss = new WebSocketServer({
    noServer: true,
    // The handshake has to answer with the protocol the client offered, or
    // the browser refuses the connection.
    handleProtocols: (protocols) => {
      for (const protocol of protocols) {
        if (protocol.startsWith(WS_TOKEN_PROTOCOL_PREFIX)) return protocol;
      }
      return false;
    },
  });

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
    const authorization = request.headers.authorization;
    const headerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : undefined;
    const subprotocolToken = protocolToken(offeredProtocols(request));
    const token = headerToken ?? subprotocolToken;

    void resolveIdentity({
      authorization: token ? `Bearer ${token}` : undefined,
      headerUserId: undefined,
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
