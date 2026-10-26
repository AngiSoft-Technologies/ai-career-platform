import { Router } from "express";
import { pool } from "../db/pool.js";
import { redis } from "../db/redis.js";

export const metricsRouter = Router();

interface Counter {
  value: number;
  labels: Record<string, string>;
}

const httpRequests = new Map<string, Counter>();
const httpDuration = new Map<string, { total: number; count: number }>();

function keyFor(method: string, route: string, status: number): string {
  return `${method}|${route}|${status}`;
}

export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  durationMs: number,
): void {
  const key = keyFor(method, route, status);
  const existing = httpRequests.get(key);
  if (existing) {
    existing.value += 1;
  } else {
    httpRequests.set(key, { value: 1, labels: { method, route, status: String(status) } });
  }

  const timing = httpDuration.get(key);
  if (timing) {
    timing.total += durationMs;
    timing.count += 1;
  } else {
    httpDuration.set(key, { total: durationMs, count: 1 });
  }
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function renderLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(",")}}`;
}

/**
 * Prometheus exposition endpoint. Fly Metrics scrapes this and feeds the
 * built-in Grafana dashboards for the app.
 */
metricsRouter.get("/metrics", async (_request, response) => {
  response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

  const lines: string[] = [];

  lines.push("# HELP jr_http_requests_total Total HTTP requests handled.");
  lines.push("# TYPE jr_http_requests_total counter");
  for (const [key, counter] of httpRequests) {
    lines.push(`jr_http_requests_total${renderLabels(counter.labels)} ${counter.value}`);
  }

  lines.push("# HELP jr_http_request_duration_ms Average request duration in ms.");
  lines.push("# TYPE jr_http_request_duration_ms summary");
  for (const [key, timing] of httpDuration) {
    const [method, route, status] = key.split("|");
    const labels = renderLabels({
      method: method ?? "",
      route: route ?? "",
      status: status ?? "",
    });
    lines.push(`jr_http_request_duration_ms_sum${labels} ${timing.total}`);
    lines.push(`jr_http_request_duration_ms_count${labels} ${timing.count}`);
  }

  const poolStats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };

  lines.push("# HELP jr_db_pool_connections Database pool connection counts.");
  lines.push("# TYPE jr_db_pool_connections gauge");
  lines.push(`jr_db_pool_connections{state="total"} ${poolStats.total}`);
  lines.push(`jr_db_pool_connections{state="idle"} ${poolStats.idle}`);
  lines.push(`jr_db_pool_connections{state="waiting"} ${poolStats.waiting}`);

  lines.push("# HELP jr_redis_connected Whether the Redis cache is connected.");
  lines.push("# TYPE jr_redis_connected gauge");
  lines.push(`jr_redis_connected ${redis.status === "ready" ? 1 : 0}`);

  lines.push("# HELP jr_process_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE jr_process_uptime_seconds gauge");
  lines.push(`jr_process_uptime_seconds ${Math.round(process.uptime())}`);

  lines.push("# HELP jr_process_resident_memory_bytes Resident memory in bytes.");
  lines.push("# TYPE jr_process_resident_memory_bytes gauge");
  lines.push(
    `jr_process_resident_memory_bytes ${process.memoryUsage().rss}`,
  );

  response.send(`${lines.join("\n")}\n`);
});
