"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_URL, WS_URL, getToken } from "./auth";

export type RealtimeEvent = {
  type: string;
  data: unknown;
  at: string;
};

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

      const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
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

export function useEventStream(enabled = true): RealtimeEvent[] {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let source: EventSource | null = null;
    let cancelled = false;

    const start = async () => {
      const token = await getToken();
      if (cancelled) return;
      const url = `${API_URL}/stream/notifications${
        token ? `?token=${encodeURIComponent(token)}` : ""
      }`;
      source = new EventSource(url, { withCredentials: true });
      source.addEventListener("events", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            items?: Array<{
              id: number;
              type: string;
              aggregateType: string;
              aggregateId: string;
              payload: unknown;
              occurredAt: string;
            }>;
          };
          const next = (payload.items ?? []).map((item) => ({
            type: item.type,
            data: item,
            at: item.occurredAt,
          }));
          setEvents((current) => [...next, ...current].slice(0, 80));
        } catch {
          return;
        }
      });
      source.onerror = () => {
        source?.close();
        if (cancelled) return;
        window.setTimeout(() => void start(), 8_000);
      };
    };

    void start();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [enabled]);

  return events;
}
