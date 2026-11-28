# Persistent server backend

The API has two runtime modes. Both use the same job handlers and Neon as the
canonical database.

## Vercel (`VERCEL=1`)

- Filesystem is ephemeral, so Redis + BullMQ and Vercel Functions own the
  background work.
- Public requests start preparation immediately with `waitUntil`.
- The existing `/internal/prepare` schedule is only a safety net for retries,
  automatic work, and interrupted invocations.

No always-on daemon, queue worker, or custom cron is required.

## Persistent production server

Default mode for any non-Vercel host. SQLite is the indexed state store and
JSONL is the append-only audit log:

| File | Purpose |
| --- | --- |
| `.data/server.sqlite` | tick leases, cache, automations, jobs, realtime events |
| `.data/server.jsonl` | append-only lease/dispatch/enqueue/ack/fail/cache/automation record |

`src/lib/server-queue.ts` is the file-backed BullMQ replacement: delayed jobs,
priority, retries with backoff, leases, stalled-job recovery, dedupe keys and a
bounded-concurrency polling worker. `src/lib/server-ticker.ts` registers the
automations and runs that worker. `src/lib/server-events.ts` is the file-backed
Redis pub/sub replacement used by WebSockets.

Redis is **not started** in this mode. Neon remains the source of truth for
application data; the SQLite/JSONL files are cache, queue and automation state.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SERVER_STATE_BACKEND` | `sqlite+jsonl` | `redis`, `jsonl`, `sqlite`, or `sqlite+jsonl` |
| `SERVER_SQLITE_FILE` | `.data/server.sqlite` | SQLite database path (mount on persistent storage) |
| `SERVER_STATE_FILE` | `.data/server.jsonl` | JSONL audit path (mount on persistent storage) |
| `SERVER_TICKER_CONCURRENCY` | `2` | Simultaneous server queue jobs |
| `SERVER_TICKER_POLL_MS` | `1000` | Queue poll interval |
| `SERVER_TICKER_SCHEDULER_MS` | `1000` | Automation scheduler interval |

Set `SERVER_STATE_BACKEND=redis` to keep the previous Redis/BullMQ topology on
a persistent host. Multiple server replicas can run the ticker: SQLite leases
and dedupe keys keep automation dispatch single-winner.

### Lifecycle

`src/index.ts` starts the ticker for `PROCESS_ROLE=app` and `PROCESS_ROLE=worker`
and skips BullMQ consumers while the server store is active. SIGINT/SIGTERM
stop the HTTP/gRPC listeners, realtime subscriber, ticker and queue worker with
their leases left intact for another replica or the next boot to recover.

`/health` reports the active store, so it is easy to confirm which topology a
deployment chose.
