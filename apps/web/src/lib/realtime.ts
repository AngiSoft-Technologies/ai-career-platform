"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_URL, WS_URL, getToken } from "./auth";

export type RealtimeEvent = {
  type: string;
  data: unknown;
  at: string;
};

/**
 * How a browser proves who it is on a WebSocket.
 *
 * A browser cannot set a request header on a WebSocket, so the token used
 * to travel in the query string — where every proxy and access log in the
 * path records it. It now travels in a subprotocol instead, which the
 * handshake carries in the headers and which the server echoes back.
 */
const WS_TOKEN_PROTOCOL_PREFIX = "authorization.bearer.";

export function useWebSocket(enabled = true): {
  connected: boolean;
  events: RealtimeEvent[];
  latest: RealtimeEvent | null;
  send: (type: string, data: unknown) => void;
} {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    closedRef.current = false;

    const connect = async () => {
      if (closedRef.current) return;
      const token = await getToken();
      if (!token) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(WS_URL, [
          `${WS_TOKEN_PROTOCOL_PREFIX}${token}`,
        ]);
      } catch {
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            data?: unknown;
          };
          if (!payload.type) return;
          const next: RealtimeEvent = {
            type: payload.type,
            data: payload.data,
            at: new Date().toISOString(),
          };
          setEvents((current) => [next, ...current].slice(0, 60));
        } catch {
          return;
        }
      };

      socket.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        if (closedRef.current) return;
        retryRef.current += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** retryRef.current);
        window.setTimeout(() => void connect(), delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    void connect();

    return () => {
      closedRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled]);

  const send = useCallback((type: string, data: unknown) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, data }));
    }
  }, []);

  return { connected, events, latest: events[0] ?? null, send };
}

/**
 * The notification stream.
 *
 * This used to be an `EventSource`, which cannot send a request header, so
 * the token had to ride in the query string — the same leak the WebSocket
 * had. Reading the stream with `fetch` instead puts the token in the
 * `Authorization` header, where it belongs, and the parsing is not much
 * more than the `EventSource` did.
 */
interface StreamItem {
  id: number;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: string;
}

function parseStreamChunk(chunk: string): RealtimeEvent[] {
  let event = "message";
  const data: string[] = [];

  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }

  if (event !== "events" || data.length === 0) return [];

  try {
    const payload = JSON.parse(data.join("\n")) as { items?: StreamItem[] };
    return (payload.items ?? []).map((item) => ({
      type: item.type,
      data: item,
      at: item.occurredAt,
    }));
  } catch {
    return [];
  }
}

export function useEventStream(enabled = true): RealtimeEvent[] {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let controller: AbortController | null = null;
    let cancelled = false;
    let timer: number | undefined;

    const start = async () => {
      const token = await getToken();
      if (cancelled) return;

      controller = new AbortController();
      try {
        const response = await fetch(`${API_URL}/stream/notifications`, {
          headers: {
            accept: "text/event-stream",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok || !response.body) throw new Error("stream failed");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const parsed = parseStreamChunk(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            if (parsed.length > 0) {
              setEvents((current) => [...parsed, ...current].slice(0, 80));
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // A dropped stream is expected; the reconnect below handles it.
      }

      if (cancelled) return;
      timer = window.setTimeout(() => void start(), 8_000);
    };

    void start();

    return () => {
      cancelled = true;
      controller?.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled]);

  return events;
}
