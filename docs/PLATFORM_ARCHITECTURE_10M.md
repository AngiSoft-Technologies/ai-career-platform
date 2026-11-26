# MboQara — Platform Architecture for 10M+ Global Users

**Status:** Design. Nothing in this document is implemented yet.
**Companion doc:** `docs/ARCHITECTURE_BOUNDARIES.md` (the boundary rule and the violation inventory). This document covers *capability and scale*; that one covers *ownership*.
**Scope:** web + mobile clients, one Express backend on Vercel, Neon Lakebase Postgres, Upstash Redis, AWS S3 object storage.
**Verified:** 2026-10-29 (infrastructure re-verified after the hosting migration to Vercel). All numbers below are quoted from vendor docs or measured against the live deployment. Where a number is an estimate, it says so.

---

## 1. Executive summary — the part that matters most

**The free tiers cannot serve 10M users. They can serve roughly 50,000–100,000 MAU.** That is not a pessimism statement, it is arithmetic, and it is the single most important design constraint in this document:

| Ceiling | Free tier gives | 10M users needs | Ratio |
| --- | --- | --- | --- |
| Neon Postgres storage | **1 GB / project**, 20 GB account | ~1 TB | 1,000× |
| Neon public egress | **5 GB / project / month** | ~2.4 TB / month | 480× |
| Neon compute | **100 CU-hours / project / month** | ~9,000 CU-hours / month | 90× |
| Neon Auth | **60,000 MAU** | 10,000,000 MAU | 167× |
| Neon Functions invocations | **1M / project** | 100M+ | 100× |
| Vercel | Hobby is non-commercial; **Pro ~$20/mo per member** + usage | Always-on-equivalent, global edge | — |

The architectural consequence, and the design rule that follows from it:

> **Every tier boundary must be a plan change and a config change, never a rewrite.**

If "go from 50k to 10M users" requires changing `PLAN` on Neon, raising Vercel spend limits, and flipping a function region — the design is correct. If it requires sharding the application by tenant, rewriting the DB layer, or re-platforming, the design is wrong. Everything below is chosen with that test applied.

Current state, measured live: **6 users, 2,449 opportunities, 8,835 skill edges, 1,265 companies, 6 candidate profiles.** This is an empty database. The architecture is therefore designed for the destination, and this document is the plan for getting there without a rewrite.

---

## 2. Verified free-tier inventory

### Neon Free plan (org `org-dark-river-63722244`, plan `free`, confirmed via MCP)

| Capability | Free allowance | Notes |
| --- | --- | --- |
| Projects | 100 | |
| Branches | 10 / project | extra branches $1.50/branch-month on paid |
| Compute | 100 CU-hours / project / month | |
| Autoscaling | up to **2 CU (8 GB RAM)** | paid: 16 CU (64 GB) or fixed 56 CU (224 GB) |
| Scale to zero | after 5 min, **cannot be disabled** | paid Launch: can disable; Scale: 1 min–always-on |
| Storage | **1 GB / project, 20 GB account total** | paid $0.35/GB-month, unlimited |
| Public network transfer | **5 GB / project included** | paid 500 GB then $0.10/GB |
| Read replicas | **max 3 per project, same region only** | cross-region needs logical replication to a *separate project* |
| Instant restore | **not available** | 6-hour history window (up to 1 GB-month) |
| Auth (Managed Better Auth) | **60,000 MAU** | paid: 1M MAU |
| Object Storage | 5 GB | paid $0.023/GB-month |
| Functions | **10 active / 400 waiting Capacity-Hours + 1M invocations** | any plan, 4 regions only |
| **AI Gateway** | **NOT available — requires paid plan (Launch/Scale) + $5 prepaid credits** | blocker, see §12 |
| Private networking | not available | |
| Compliance / IP Allow / Protected branches | not available | |
| Monitoring | 1 day | |
| Support | community | |

**Neon region availability — and the fact that decides this whole design:** `list_regions()` returned **11 regions, zero in Africa**:

`aws-us-east-2, azure-eastus2, aws-us-east-1, azure-westus3, azure-gwc, aws-us-west-2, aws-eu-central-1, aws-eu-west-2, aws-ap-southeast-1, aws-ap-southeast-2, aws-sa-east-1`

**Neon Functions / Object Storage / AI Gateway / Realtime are restricted to 4 regions:** `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1` (Frankfurt), `aws-ap-southeast-1` (Singapore).

### Vercel (the API + web host)

| Fact | Value |
| --- | --- |
| Hobby plan | Free, **non-commercial use only** — a paid product cannot legally run on it |
| Pro plan | ~$20/mo per member, includes usage credits; commercial use allowed |
| Compute model | Serverless functions / Fluid compute — scale to zero, no always-on VMs |
| Regions | Global edge; function regions include **`cpt1` (Cape Town)** — the only African region of any major host we evaluated, and it is what `apps/web/vercel.json` already pins (`regions: ["cpt1"]`) |
| Static/data transfer | Fast Data Transfer metered after included allowance (~$0.15/GB on Pro — estimate, check current pricing) |
| Functions | Concurrent executions capped per plan; long-running work needs Fluid/`maxDuration` or an external worker |
| WebSockets / gRPC | **Constrained** — serverless functions are request-scoped; persistent connections need a different home (see §4 note) |
| Secrets / env | `vercel env` — already how `SMTP_*`, `DATABASE_URL`, `JWT_SECRET` are managed |

**The honest caveat:** the API is a long-lived Express process (SSE, WebSocket, gRPC, BullMQ workers, a 1-second ticker). Vercel's request-scoped functions cannot host all of that as-is. Today the deployment works because the workload fits; at scale the background workers and realtime transports need a dedicated host (see §4 and the open question in §16). This is the single biggest architectural difference from the previous container-host topology.

### Upstash Redis

| Plan | Price | Max commands/sec | Max data | Monthly bandwidth |
| --- | --- | --- | --- | --- |
| Pay-as-you-go | **$0.20 / 100k requests** | **10,000** | 10 GB | — |
| Fixed 250MB | $10/mo + $5/read region | — | 250 MB | 50 GB |
| Fixed 1GB | $20/mo + $10/read region | — | 1 GB | 100 GB |
| Fixed 5GB | $100/mo + $50/read region | — | 5 GB | 500 GB |
| Fixed 10GB | $200/mo + $100/read region | — | 10 GB | 1 TB |
| Fixed 50GB | $400/mo + $200/read region | — | 50 GB | 5 TB |

Key behaviours:
- **Replicas forward writes to the primary; writes are synchronous and slow over distance.** Read regions cannot be written to.
- Docs explicitly warn: *"If you're using Sidekiq, BullMQ or similar software, consider switching your database to a fixed price plan to avoid running up your pay-as-you-go bill."* **This applies directly to us — BullMQ is already in the stack.**
- Eviction is off by default on queue DBs (writes rejected at limit); cache DBs should have eviction on.

### Object storage — AWS S3 (current) / Tigris (alternative)

- **Current:** AWS S3 via `@aws-sdk/client-s3` (credentials already in env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `S3_BUCKET`). Region-pinned; pair with CloudFront or a CDN for edge reads.
- **Alternative:** Tigris — S3-compatible, globally distributed object storage with automatic replication; "this automatic global replication can replace a CDN" per its docs. Public bucket URLs are S3-style; custom domains via CNAME. Access keys printed once at create.
- Billed at provider list price; **transfer out of the bucket is billed separately as egress** — which makes a CDN in front non-optional at scale.

---

## 3. The scale arithmetic

Assumptions: 10M MAU, 300M requests/month, 60% of traffic from Africa (Kenya primary), average response ~8 KB after gzip/brotli.

| Resource | Derivation | Result |
| --- | --- | --- |
| Storage | 10M users × ~100 KB avg (profile + applications + matches + doc metadata) + 5M opportunities × 5 KB + 5M embeddings × 6 KB | **~1.1 TB** → Neon Launch @ $0.35/GB-mo ≈ **$385/mo** |
| Neon compute | 300M req/mo ≈ 115 req/s avg, ~1,200 req/s peak. Primary 8 CU + 3 read replicas × 4 CU, ~12 CU sustained average | 12 × 730 = 8,760 CU-h × $0.106 ≈ **$930/mo** |
| Vercel compute | Function GB-hours + requests at 300M/mo — estimate **$400–900/mo** depending on Fluid settings and caching hit rate (Vercel's per-request pricing punishes uncached dynamic traffic) | **~$400–900/mo (estimate)** |
| Vercel egress | 300M × 8 KB = 2.4 TB fast data transfer @ ~$0.15/GB ≈ **$360/mo** — partially offset by CDN caching of public reads | **~$200–360/mo (estimate)** |
| Upstash Redis | ~1 Redis op per request = 300M ops. PAYG = 300M/100k × $0.20 = **$600/mo**. Fixed 10GB = **$200/mo** | **$200/mo (must use fixed plan)** |
| S3 + CDN | ~50 TB user files at S3 list price + transfer/CDN | **~$1,000–1,300/mo** |
| Neon Auth | 10M MAU exceeds even Scale's 1M MAU cap | **self-host or multi-tenant — see §11** |
| Worker/realtime host | BullMQ workers + WS/gRPC cannot live in request-scoped functions — dedicated container (see §4) | **~$50–200/mo (estimate)** |

**Order-of-magnitude total at 10M MAU: $2,500–4,000 / month.** Storage and object storage dominate; egress is real but second-order (~$300). Neither is the free tier.

**The byte-efficiency insight:** African users pay the highest effective latency and every uncached byte crosses a long-haul link. Response shaping (GraphQL sparse fieldsets on mobile, §6) is a *cost and latency control*, not a nicety — the single highest-leverage optimization available.

---

## 4. Target architecture

```
                          ┌──────────────────────────────────────────────┐
   Web (Next.js)          │  Vercel CDN  (static, edge-cached, global)    │
   Mobile (Flutter)       │  pinned to cpt1 (Cape Town) for the app       │
   └──────────────────────┴──────────────────────────────────────────────┘
                    │ REST /v1  ·  GraphQL /v1/graphql  ·  SSE /v1/stream
                    ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║  VERCEL — edge network + serverless functions                             ║
║  api.mboqara.angisoft.co.ke → Express app                                 ║
║  TLS termination · edge cache · function concurrency limits               ║
╚═══════════════════════════════════════════════════════════════════════════╝
   │                      │                        │                    │
   ▼ cpt1 (Cape Town)     ▼ fra1 (Frankfurt)       ▼ iad1 (N. Virginia)   ▼
 ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐  ┌───────────────┐
 │ API functions │  │ API functions │  │ API functions    │  │ API functions │
 │ (request-     │  │               │  │                  │  │               │
 │  scoped)      │  │               │  │                  │  │               │
 └───────┬───────┘  └───────┬───────┘  └────────┬─────────┘  └───────┬───────┘
         │                  │                   │                    │
         │            dedicated worker host ────┴────────────────────┘
         │            (BullMQ consumers, gRPC, WS/SSE fan-out —
         │             request-scoped functions cannot hold these;
         │             PROCESS_ROLE=worker exists for exactly this)
         │
   ┌─────┴──────────────────────────────────────────────────────────────┐
   ▼                         ▼                          ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌────────────────────┐ ┌─────────────────┐
│ UPSTASH REDIS    │ │ UPSTASH REDIS    │ │ NEON LAKEBASE      │ │ AWS S3          │
│ cache (evict on) │ │ queue (BullMQ)   │ │ POSTGRES           │ │ (+ CDN in front)│
│ per-region       │ │ per-region       │ │                    │ │                 │
└──────────────────┘ └──────────────────┘ │ primary rw compute │ └─────────────────┘
                                            │ aws-eu-central-1   │
                                            │ + 3 read replicas  │
                                            │ (same region only) │
                                            └────────────────────┘
```

### The geographic truth this diagram encodes

1. **Vercel has an African region — `cpt1` (Cape Town)** — the first major host in this stack that does. Web is already pinned there. API functions can follow.
2. **No Postgres can live in Africa.** Neon has zero African regions, so authoritative reads still pay a Cape Town → Frankfurt round trip. African reads must come from Redis, the CDN, and edge cache; Postgres is for the ~30% of requests that need fresh authoritative data.
3. **Writes always go to Frankfurt** — the Neon primary lives there. Every write pays the distance; keep the write path small.

**Expected latencies from Nairobi (estimates, to be measured):**
- Edge-cached static + CDN reads: 15–40 ms
- `cpt1`-local Redis hit: 20–50 ms
- Frankfurt Postgres read: 130–180 ms
- Write (Frankfurt commit): 150–250 ms
- S3/CDN fetch: 20–60 ms

**Measured from Nairobi, 2026-10-30** (`services/api/scripts/probe-latency.mjs`, 20–25 samples each,
served by the previous single-region deployment):

| Path | p50 | p95 | max |
| --- | --- | --- | --- |
| `/live` (no DB, no Redis) | 84 ms | 124 ms | 1,209 ms |
| `/live`, second run | 95 ms | 133 ms | 723 ms |
| `/v1/public/stats` | 77 ms | 409 ms | 451 ms |

Two things fall out of this. First, the 15–40 ms estimate for an edge read was optimistic — the
median for a *no-op* endpoint is already ~85 ms, and both medians exceed the table above for a
Frankfurt Postgres read. Second, the tail is the real problem: roughly one request in five takes
4–15× the median, and `/v1/public/stats` has a worse p95 than `/live`, which points at connection
acquisition rather than query time. The next step is not a new region, it is connection reuse and
a repeat of these numbers with a keep-alive client.

**Persistent-connection caveat:** SSE (`/v1/stream`), the WebSocket hub, and gRPC `:50051` assume a long-lived process. On Vercel these need either Fluid compute with extended `maxDuration`, a separate always-on worker host, or a managed realtime service — decide before the 10M path, not during it.

---

## 5. Neon capability blend — what each primitive is for

| Primitive | Role in MboQara | Why it, specifically |
| --- | --- | --- |
| **Lakebase Postgres** | System of record. Primary + read replicas | Standard Postgres, any ORM, decoupled storage, instant branch-per-PR |
| **Branching** | Dev/test/CI/preview. `dev-*`, `br-<pr>`, `staging` | Copy-on-write, zero data duplication, spins up in seconds. Removes the need for a shared staging DB |
| **Read replicas** | Offload analytics, reporting, read-only access | No storage duplication, spins up in seconds. **Free: 3 max, same-region only** |
| **Auth (Managed Better Auth)** | Identity, credentials, OAuth, sessions in `neon_auth.*` | **60k MAU free.** Google works with shared dev credentials, zero setup |
| **Object Storage** | Branch-scoped fixtures, dev uploads | 5 GB free, branches with DB. **Not for production user files** — not in African-capable regions |
| **Functions** | Long-running, streaming, cron-triggered jobs next to the data | 15-min response start, WebSocket/SSE keeps flowing. 4 regions, any plan |
| **Realtime** | Live queries for dashboards / feed | Replaces polling. Beta. Candidates: match feed, notification badge, application status |
| **Data API** | **Not used** | PostgREST compatibility only. We have an Express backend; adding PostgREST would create a second, un-audited write path — a direct boundary violation |
| **AI Gateway** | **Not available on Free** | Requires Launch/Scale + $5 prepaid. See §12 |

---

## 6. Protocol blend — the honest decision table

The user's instinct to blend REST, GraphQL, gRPC, MCP and SOAP is right, but only if each is placed where it is actually the best tool. Three of these five are correct here. Two are not, and saying so is more useful than building them.

| Protocol | Verdict | Where it goes | Reasoning |
| --- | --- | --- | --- |
| **REST** `/v1/*` | **Primary** | All web + mobile calls. Writes, auth, simple reads | One contract, HTTP-cachable, trivially debuggable, works identically on web and mobile. Already built and mounted |
| **GraphQL** `/v1/graphql` | **Yes — cost control, not novelty** | Mobile read paths: opportunity feed, match list, profile, applications list | **This is the egress argument.** A Kenyan user's feed fetched at 50 KB and shaped to 6 KB saves 88% of the response. Also kills N+1 waterfall on 3G. `graphql-yoga` and the schema **already exist in `app.ts`** |
| **gRPC** `:50051` | **Yes — internal only** | Worker dispatch, service-to-service, bulk ingestion batches | Binary + HTTP/2 multiplexing is far cheaper than JSON for internal high-volume traffic. **Never exposed to browsers.** Already implemented — but note gRPC needs a persistent host, not request-scoped functions |
| **MCP** `/v1/mcp` | **Yes — growth channel, not core** | Expose MboQara search + matching as tools for Claude / Copilot / other agents | Already implemented with OAuth-protected-resource metadata. Not a product path; a distribution path |
| **SOAP** | **No — do not build** | — | SOAP's entire value is WS-Security + WS-* contracts with enterprise HR systems. There is no such partner. If a Kenyan employer (SAP SuccessFactors, a payroll vendor) ever mandates SOAP, add a **single thin endpoint** then. Building it now is pure cost with zero users |

**The deleted-path rule:** `apps/web/src/lib/graphql.ts` is dead code — web never calls GraphQL. Per the boundary rule it gets removed, and the GraphQL endpoint becomes mobile-first.

---

## 7. Data layer at 10M users

### Current state (measured)

44 tables. Zero partitioning. `notifications` has **only a primary key** — no index on `user_id`, `read`, or `created_at`. `matches` has only `(user_id, opportunity_id)`. Every user notification poll and every "top matches" query is a **seq scan**. These two are the highest-severity performance defects in the schema and they are invisible today because the tables are nearly empty.

### Sharding vs partitioning — the right first move

**Do not shard. Partition.** At 10M users the problem is table size, not database count.

- **User-owned tables** (`applications`, `matches`, `notifications`, `followups`, `documents`, `candidate_*`) → declarative **hash partitioning on `user_id`, 32 partitions**. This keeps each partition small, enables partition pruning on every user-scoped query (which is ~all of them).
- **Global catalog** (`opportunities`, `companies`, `opportunity_skills`, `profession_taxonomy`, `scam_signatures`) → **range partitioning on `posted_at` (monthly) + BRIN** for the time-ordered append pattern. 2,449 rows today; millions at scale.
- **Never shard the catalog** — it is shared, read-mostly reference data that every user sees.

**Correction to an earlier claim in this section: this is not a pure DDL change.** PostgreSQL requires every
`PRIMARY KEY` and `UNIQUE` constraint on a partitioned table to include the partition key. Every one of these
tables has a surrogate `id` primary key, so hash-partitioning on `user_id` forces one of:

1. `PRIMARY KEY (user_id, id)` — `id` becomes unique *per partition*, not globally, so any lookup by `id`
   alone is no longer safe; or
2. drop the surrogate key, which every row reference in the application currently relies on.

That is a semantic decision about identity, made permanently, in exchange for a table that holds **1 row
today**. So partitioning is deferred to the trigger below, and P4 is left deliberately undone. The
alternative — doing it now while the tables are empty — would be to make the constraint decision without
any data to validate it against and then live with it forever. Trigger: a user-owned table passing ~50M rows,
or the primary compute saturating, whichever comes first.

Only then does real sharding become necessary, and at that point the move is **logical replication into
additional Neon projects** (project-per-shard), which Neon natively supports. That is a plan change plus a
routing layer, not a rewrite.

### Read replica routing

```
write  →  primary (aws-eu-central-1, Frankfurt)
read   →  local replica if one exists in the serving region,
          else Redis → CDN → primary (paying the latency)
```

Neon read replicas are **same-region only**, so `cpt1` has no local replica. African reads therefore go: Redis → CDN → (Frankfurt, paying latency). Only 3 read replicas exist on Free, and they are useless to Kenyan users — the replica strategy serves *throughput and analytics offload*, not African latency. Say this plainly rather than pretending replicas solve the geography.

### Concrete index gaps to close (migration 013)

```sql
-- notifications: currently PK-only. This is the worst defect in the schema.
CREATE INDEX CONCURRENTLY notifications_user_created_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX CONCURRENTLY notifications_user_unread_idx
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- matches: no score index, so "best matches" is a seq scan.
CREATE INDEX CONCURRENTLY matches_user_score_idx
  ON matches (user_id, score DESC) WHERE dismissed_at IS NULL;
CREATE INDEX CONCURRENTLY matches_opportunity_idx ON matches (opportunity_id);

-- opportunities: mobile feed filters. BRIN for the append-only time column.
CREATE INDEX CONCURRENTLY opportunities_recent_feed_idx
  ON opportunities (country, status, posted_at DESC)
  WHERE status = 'active';
CREATE INDEX CONCURRENTLY opportunities_seniority_feed_idx
  ON opportunities (country, status, seniority, posted_at DESC)
  WHERE status = 'active';
CREATE INDEX CONCURRENTLY opportunities_min_salary_idx
  ON opportunities (country, min_salary) WHERE status = 'active';
CREATE INDEX CONCURRENTLY opportunities_created_brin
  ON opportunities USING BRIN (created_at) WITH (pages_per_range = 32);

-- applications: recency list per user.
CREATE INDEX CONCURRENTLY applications_user_created_idx
  ON applications (user_id, created_at DESC);

-- followups: worker sweeps by due date (exists), but user lookups don't.
CREATE INDEX CONCURRENTLY followups_user_due_idx
  ON followups (user_id, due_at) WHERE status = 'pending';

-- audit / auth hot paths.
CREATE INDEX CONCURRENTLY audit_events_user_created_idx
  ON audit_events (user_id, created_at DESC);
```

Plus: `ANALYZE` after each migration, and `pg_stat_statements` on the primary to verify pruning. Composite index order follows the equality-then-sort rule: equality columns (`user_id`, `country`, `status`) first, range/sort column (`posted_at DESC`, `score DESC`) last.

---

## 8. Queues — BullMQ on Upstash Redis

Already implemented (`worker/index.ts`, `services/api/src/worker/`). Design:

| Queue | Trigger | Concurrency | Priority |
| --- | --- | --- | --- |
| `ingest` | cron per job source | 4 | bulk |
| `embed` | new/updated opportunity | 8 | bulk |
| `match-recompute` | preference or profile change | 4 | normal |
| `notify` | match created, followup due | 16 | **critical** |
| `document-generate` | user requests CV / cover letter | 2 | normal (PDF CPU-bound) |
| `ai-analysis` | scam check, ranking, summarise | 4 | normal |
| `cache-warm` | deploy, TTL expiry | 8 | bulk |

Rules:
- **One Redis DB per region** (`cpt1`, `fra1`, `iad1`). Queues are region-local; only results are shared.
- **Eviction ON** for cache DBs, **OFF** for queue DBs (never lose a notification).
  Reported at startup by `services/api/src/db/redis-policy.ts`. Note: Upstash exposes
  neither `CONFIG GET` nor `CONFIG SET` for `maxmemory-policy`, so this is an
  **operator action** — set Eviction to *noeviction* on the Upstash database.
  Upstash ships `optimistic-volatile` by default, which drops queued jobs
  silently; this is currently the biggest silent-failure risk in the stack.
- **Dead-letter queues** after 5 attempts, exponential backoff with jitter.
- **Idempotency** on every mutating endpoint via the `idempotency_keys` table from migration 012 — the same key returns the stored response instead of a second write. Mobile networks retry aggressively; without this, retries duplicate applications.
- **Switch to a fixed Upstash plan.** PAYG at $0.20/100k with BullMQ is a documented cost trap. At 300M ops/month PAYG is $600/mo vs $200/mo for fixed 10 GB.
- **Workers cannot run in request-scoped functions.** BullMQ consumers, the gRPC server and the WebSocket hub need a persistent process — `PROCESS_ROLE=worker` exists for a dedicated deployment (container host, or Vercel's long-running compute where available).

---

## 9. Caching

Layer order: Vercel CDN (web static + public API reads) → Upstash Redis → Postgres (Neon).

| Cache | Key | TTL | Eviction |
| --- | --- | --- | --- |
| Session / roles / permissions | `rbac:{userId}` | 60 s | off (small) |
| User profile | `user:{userId}` | 300 s | off |
| Public aggregate stats | `stats:public` | 900 s | off |
| Hot opportunity feed | `feed:{country}:{role}:{page}` | 120 s | on |
| Search results | `search:{hash(query)}` | 120 s | on |
| Rate-limit counters | `rl:{ip}:{route}` | window | on |
| Idempotency keys | in Postgres, not Redis | 24 h | — |

**Single-flight / lock-per-key** on cache misses (a stampede on a cold feed key at 1,200 req/s is a self-inflicted outage). **Never cache** auth responses, money, or per-user PII beyond the profile entry.

---

## 10. Object storage and CDN

| Store | Used for | Why not the other |
| --- | --- | --- |
| **AWS S3** (current) | **All production user files**: CVs, avatars, generated PDFs, document versions | Already wired via `@aws-sdk/client-s3`; presigned PUT keeps credentials off clients. Needs a CDN in front for edge reads |
| **Tigris** (alternative) | Same role, if global replication without a separate CDN is preferred | Automatic global replication — *the CDN is built in*. S3-compatible, so the client code works unchanged |
| **Neon Object Storage** (5 GB free) | Branch-scoped fixtures and dev uploads only | Branches with the database, which is genuinely useful for testing upload flows — but only exists in 4 non-African AWS regions, so every Kenyan fetch would cross to Frankfurt |
| **Vercel Blob / static** | Web static assets (`/media` photography, the Next.js bundle) | Hosts the app; edge cache included |

Private buckets + presigned PUT from the backend. The backend signs, S3 stores, the CDN serves. **Clients never hold storage credentials.**

---

## 11. Auth — the Google answer, and the boundary

### The blocked question, resolved

**Resolution: the API runs the Google authorization-code + PKCE flow itself. Neon Auth is
no longer in the sign-in path at all** (removed after repeated production failures —
state mismatches and lost session challenges).

```
1. Mobile opens a Custom Tab / ASWebAuthenticationSession to
     https://api.mboqara.angisoft.co.ke/v1/auth/google/start
       ?redirect_uri=mboqara://auth/callback
2. Backend: store state + PKCE verifier in auth_oauth_states (10 min TTL), respond 302 ->
     accounts.google.com/o/oauth2/v2/auth (client_id, redirect_uri=<API>/v1/auth/google/callback,
     code_challenge, state, prompt=select_account)
3. Google consent -> Google 302s the browser to the API callback with code + state
4. Backend: POST oauth2.googleapis.com/token (code + verifier)
     -> verify id_token against Google JWKS (audience = GOOGLE_WEB_CLIENT_ID)
     -> map identity -> app user (auth_identities) -> create handoff code
5. Backend 302s to mboqara://auth/callback#code=<handoff>
6. App POSTs /v1/auth/exchange { code } -> MboQara access token (15 min) +
   rotating refresh token (long-lived). Done.
```

This is exactly how LinkedIn, X and GitHub do native social sign-in. **No `google-services.json`, no iOS `GIDClientID`, no Google client ID from the user, no Gradle plugin.** The mobile app needs only a Custom Tab and a deep-link handler — `flutter_web_auth`-style, not `google_sign_in`.

The Google OAuth client needs the API callback
(`https://api.mboqara.angisoft.co.ke/v1/auth/google/callback`) as an authorized redirect URI;
the app redirect (`mboqara://auth/callback`) is where the browser lands *after* the API
finishes, and is allowed by `AUTH_OAUTH_REDIRECT_ALLOWLIST` on the API.

### Token model (already implemented in `auth/tokens.ts`)

- **Access token:** HS256 JWT, `sub` = local `users.id`, issuer/audience `mboqara`, **15 minutes**, `jti`.
- **Refresh token:** 32-byte random, stored **hashed** (SHA-256) in `auth_refresh_tokens`, rotated on every use; web sessions carry it in an httpOnly cookie for long-lived sign-in.
- **Step-up verification:** `users.last_verified_at` is stamped at interactive sign-in; once older than `AUTH_STEP_UP_INTERVAL_SECONDS` the API answers `VERIFICATION_REQUIRED` and the user proves identity again via TOTP or an emailed magic link (`auth/verification.ts`).
- **Reuse detection:** presenting an already-rotated token revokes the *entire family* — attacker and victim both forced to re-auth. This is the correct OAuth 2.1 behaviour and it is already built.
- `JWT_SECRET` is now actually used, and refuses to start in production under 32 chars.

### Boundary (from `ARCHITECTURE_BOUNDARIES.md`)

The backend owns identity end to end — passwords, sessions, refresh tokens, and the social sign-in handshake with Google/LinkedIn. Clients receive MboQara tokens and nothing else. `resolveIdentity` accepts **only** app-minted tokens. Mobile and web never address a provider or a hosted auth service.

---

## 12. AI layer

**AI Gateway is unavailable on Free** — it requires Launch/Scale plus $5 prepaid credits. Current options:

1. **Now:** call the existing `NVIDIA_AI_API_KEY` (already in `.env.local`) directly from the backend. Works today, zero cost change.
2. **On upgrade:** switch to Neon AI Gateway — one credential, OpenAI/Anthropic-compatible endpoints, per-branch scoping (dev branch can burn tokens without touching prod).

Either way: **the backend is the only caller.** Mobile and web call `/v1/ai/*` and never see a model key. This is already the shape of `routes/ai.ts`.

---

## 13. Observability

The user asked for Grafana specifically. The pipeline is host-agnostic:

| Signal | Source | Destination |
| --- | --- | --- |
| App metrics | `routes/metrics.ts` (Prometheus format, `recordHttpRequest` already wired in `app.ts`) | Prometheus scraper → **Grafana** dashboards |
| Runtime/system | Vercel dashboard + drain | Grafana / Vercel Observability |
| Neon Postgres | Neon console (1 day history on Free) | Neon dashboard |
| Neon Functions / Object Storage logs | `neon logs query --branch production --source function` | Loki → Grafana |
| App logs | `pino-http` + `logger.ts` (already wired) | Vercel log drains → Loki |
| Distributed traces | **missing — add OpenTelemetry** | Grafana Tempo or Jaeger |
| Error tracking | **missing — add Sentry or GlitchTip** | alerts |
| Uptime / synthetic | Vercel checks + `/live`, `/health` | Grafana alerts |

**Gaps to close:** OpenTelemetry traces (a request that crosses edge → function → Postgres → Redis → BullMQ is invisible without them), and synthetic checks from an African vantage point — `cpt1` health checks do not tell you what a Kenyan user experiences.

---

## 14. Cost model

| Line | At 10M MAU | Free tier? |
| --- | --- | --- |
| Neon storage (~1.1 TB) | ~$385 | ❌ 1 GB |
| Neon compute (~8,760 CU-h) | ~$930 | ❌ 100 CU-h |
| Neon Auth (10M MAU) | exceeds Scale cap → self-host or partition | ❌ 60k MAU |
| Vercel functions + fast data transfer | ~$400–900 + ~$200–360 (estimates) | ❌ Hobby is non-commercial |
| Worker/realtime host | ~$50–200 (estimate) | ❌ |
| Upstash Redis (fixed 10 GB + 1 read region) | ~$300 | n/a |
| S3 + CDN (~50 TB files) | ~$1,000–1,300 | n/a |
| **Total** | **~$2,500–4,000 / month** | |

Free tier realistically carries **50k–100k MAU** for $0 — and even that assumes the worker/realtime host is the one always-paid line.

---

## 15. Migration plan

Extends P0–P5 in `ARCHITECTURE_BOUNDARIES.md`.

| Phase | Work | Unblocks |
| --- | --- | --- |
| **P1 — Auth boundary** *(done)* | `authRouter` mounted at `/v1/auth` **ahead of** the identity middleware; API-owned passwords; refresh rotation + reuse detection; migrations 012–016; contract types; 25-check verification suite green against production | Backend owns identity |
| **P1b — Production wiring** *(done)* | `GOOGLE_WEB_CLIENT_ID`, `AUTH_OAUTH_REDIRECT_ALLOWLIST`, a real `JWT_SECRET` and SMTP secrets in Vercel env; Redis eviction policy corrected at startup | Sign-in + email work outside localhost |
| **P2 — Cut clients off Neon** *(done)* | `neon_auth_service.dart` deleted; cookie `token_storage.dart` removed; mobile → Custom Tab flow; web auth runs same-origin through the `/api` rewrite with httpOnly cookies | Boundary is real |
| **P2b — Hosting migration** *(done)* | Container-host config and the process-group/replay machinery removed; API + web on Vercel behind `api.mboqara.angisoft.co.ke` / `mboqara.angisoft.co.ke` | Single host, custom domains |
| **P3 — Schema at scale** *(next)* | Migration 013 (the indexes in §7); `pg_stat_statements`; autovacuum tuning; verify index usage with `EXPLAIN` | Reads stop seq-scanning |
| **P4 — Partition** *(deferred, deliberately)* | Would force a permanent decision about surrogate-key uniqueness — see the correction in §7. Trigger: ~50M rows per user-owned table | Table size stops mattering |
| **P5 — Realtime/worker home** | Decide where BullMQ workers + WS/SSE + gRPC live now that the API is request-scoped (`PROCESS_ROLE=worker` on a container host, or Vercel long-running compute); `cpt1` function region for the API | Global latency + durable background jobs |
| **P6 — Protocol blend** | Mobile reads → GraphQL; worker → gRPC; MCP exposed for agents; delete dead web GraphQL client | Cost + throughput |
| **P7 — Observability** | OTel traces, error tracking, African synthetic checks, Grafana dashboards | Operability |
| **P8 — Upgrade** | Neon Launch; AI Gateway on; Functions for long-running streams; Realtime where polling exists | Past 100k MAU |

> **Local ≠ production.** Three defects were invisible locally and broke production outright:
> the auth router sat *behind* the identity middleware (so nobody could obtain a token — masked
> locally by `DEMO_MODE`), `JWT_SECRET` was unset (the API refuses to sign tokens in production
> without a real one), and Redis ran `optimistic-volatile` (queued jobs evaporate at the memory
> limit). Details and fixes: `ARCHITECTURE_BOUNDARIES.md` §7.5. Verify in production, not just
> locally.
>
> **Still needs a human:** Upstash does not let a client change `maxmemory-policy`. Set Eviction to
> `noeviction` on the Upstash database in the console — otherwise jobs can still be dropped at the
> memory limit, and the app can only warn.

### CI gates
1. `npm run typecheck` (API) + `@angisoft/mboqara-web` typecheck — must pass.
2. **No client may import a Neon/provider SDK.** Failure if `apps/web/**` or `apps/mobile/**` references `neonauth`, `NEON_AUTH_BASE_URL`, `neon.tech`, or any `AWS_*` key.
3. **No direct provider DB strings in clients.** Only `https://api.mboqara.angisoft.co.ke/v1` (or a config-injected origin) may appear.
4. Migrations must be additive and safe on existing data (`CREATE INDEX CONCURRENTLY`, no destructive column drops in the same release as the code that stops using them).

### Acceptance checklist

- [x] Mobile Google sign-in completes end-to-end with **zero** Google client *secrets* in the repo or in hosting secrets. (The OAuth `client_id` is a public identifier by design; the flow needs no secret at all — the Neon client is a PKCE public client.)
- [x] No mobile/web code path reaches Neon, S3, or any provider directly — enforced by `npm run check:boundaries` in CI.
- [x] `/v1/auth/*` returns `Cache-Control: no-store`; rate limits enforced.
- [x] Refresh rotation + reuse detection verified (reuse kills the family) — `verify-auth.mjs`.
- [x] Every `EXPLAIN` on the four hottest queries uses an index, not a seq scan — verified with `enable_seqscan` forced off in migration 017; the planner already takes the feed index at 3,103 rows.
- [x] p95 from Nairobi measured and recorded — 124 ms for `/live`, but a 1.2 s max. The tail is the open problem, not the median.
- [ ] A write is served by the primary while reads hit replicas/edge cache where available. *(replica routing designed; region placement pending §16 Q3)*
- [ ] Load test at 1,200 req/s peak on a staging branch before Launch upgrade.

---

## 16. Open questions for you

1. **Google branding.** Do you want the zero-config redirect flow (ships now, no client ID), or branded consent screens + true native `google_sign_in` (needs a Google OAuth web client ID — one-time, ~10 minutes in Google Cloud Console)? Recommendation: **ship the redirect flow this week, add the client ID later.** The switch is one config value plus one client change.
2. **Neon plan.** Confirm you are ready to move to **Launch** when storage crosses ~800 MB. I can set a threshold alert.
3. **Worker + realtime host.** BullMQ workers, the WebSocket hub and gRPC cannot run in request-scoped Vercel functions. Options: a small always-on container (the same Dockerfile shape we removed, on any container host), Vercel's long-running compute where available, or a managed realtime service. This decides the P5 phase.
4. **AI provider.** Stay on the direct NVIDIA key, or upgrade Neon to Launch for AI Gateway?
5. **SOAP.** Is there a specific enterprise partner that requires it? If not, my recommendation is not to build it — say the word and I'll add one thin endpoint.

---

## Appendix — verified sources

- Neon plans, read replicas, regions, Functions, AI Gateway: `neon.com/docs/introduction/plans`, `/introduction/read-replicas`, `/compute/functions/overview`, `/ai-gateway/overview`, plus `Neon.list_regions()` (11 regions, zero African) and `Neon.list_organizations()` (org plan = `free`).
- Vercel functions, regions (`cpt1` Cape Town), Fast Data Transfer pricing, Fluid compute: `vercel.com/docs`, project settings on `mboqara-api` / `mboqara`.
- Upstash Redis plans and eviction semantics: `upstash.com/docs/redis`, pricing page.
- Better Auth / Neon Auth Google: `better-auth.com/docs/authentication/google`, `neon.com/docs/auth/guides/setup-oauth`.
- Live probes: Neon Auth `/sign-in/social` × 4 payload shapes (all returned redirect URLs), `/token` (401 without challenge cookie).
