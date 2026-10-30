# Job Radar — Platform Architecture for 10M+ Global Users

**Status:** Design. Nothing in this document is implemented yet.
**Companion doc:** `docs/ARCHITECTURE_BOUNDARIES.md` (the boundary rule and the violation inventory). This document covers *capability and scale*; that one covers *ownership*.
**Scope:** web + mobile clients, one Express backend on Fly.io, Neon Lakebase Postgres, Upstash Redis, Tigris object storage.
**Verified:** 2026-10-29. All numbers below are quoted from vendor docs or measured against the live deployment. Where a number is an estimate, it says so.

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
| Fly.io | **No free tier.** 2 h trial or 7 days, whichever first | Always-on, multi-region | — |

The architectural consequence, and the design rule that follows from it:

> **Every tier boundary must be a plan change and a config change, never a rewrite.**

If "go from 50k to 10M users" requires changing `PLAN` on Neon, changing `fly scale count`, and flipping a replica host — the design is correct. If it requires sharding the application by tenant, rewriting the DB layer, or re-platforming, the design is wrong. Everything below is chosen with that test applied.

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

### Fly.io (18 regions, confirmed from `docs.fly.io/reference/regions.md`)

| Fact | Value |
| --- | --- |
| Free tier | **None.** Trial: up to 2 h machine runtime **or** 7 days, whichever comes first |
| Cheapest always-on machine | `shared-cpu-1x` / 256 MB in `iad`/`ewr` = **$2.19 / 30 days** |
| Machine RAM overage | ~$0.0087/hr per 30 days per additional GB (from published table) |
| Volumes | **$0.15 / GB / month** |
| Volume snapshots | first **10 GB free / month**, billed on stored size not provisioned |
| Egress → internet | **$0.02/GB** N.America+Europe · **$0.04/GB** Asia Pacific, Oceania, S.America · **$0.12/GB** **Africa & India** |
| Private cross-region transfer | $0.006/GB NA/EU · $0.015/GB APAC/Oceania/SA · **$0.050/GB** Africa & India |
| Same-region private transfer | **free** |
| Inbound data | **free** |
| Shared IPv4, IPv6, inbound, first 10 SSL certs | **free** |
| Static egress IP | $0.005/hr (~$3.60/mo) |
| Wildcard cert | $1/mo |
| Builders / image registry / image pulls | **free** |
| **African region** | **`jnb` (Johannesburg) only — and it has NO Gateway and NO Managed Postgres** |

**The two most expensive facts in this project:**
1. Fly egress from Africa is **6× Europe** ($0.12 vs $0.02 per GB).
2. Neon has **no African region at all**, and Fly's only African region (`jnb`) has **no Gateway** (no WireGuard private network) and **no Managed Postgres**.

### Upstash Redis on Fly (`flyctl redis`)

| Plan | Price | Max commands/sec | Max data | Monthly bandwidth |
| --- | --- | --- | --- | --- |
| Pay-as-you-go | **$0.20 / 100k requests** | **10,000** | 10 GB | — |
| Fixed 250MB | $10/mo + $5/read region | — | 250 MB | 50 GB |
| Fixed 1GB | $20/mo + $10/read region | — | 1 GB | 100 GB |
| Fixed 5GB | $100/mo + $50/read region | — | 5 GB | 500 GB |
| Fixed 10GB | $200/mo + $100/read region | — | 10 GB | 1 TB |
| Fixed 50GB | $400/mo + $200/read region | — | 50 GB | 5 TB |

Key behaviours (from Fly docs):
- Available in **all Fly regions** via private IPv6 restricted to your org — traffic auto-routes to nearest replica.
- **Replicas forward writes to the primary; writes are synchronous and slow over distance.** Read regions cannot be written to.
- Docs explicitly warn: *"If you're using Sidekiq, BullMQ or similar software, consider switching your database to a fixed price plan to avoid running up your pay-as-you-go bill."* **This applies directly to us — BullMQ is already in the stack.**
- Eviction is off by default (writes rejected at limit); region-local cache DBs should have eviction on.

### Tigris on Fly (`fly storage create`)

- S3-compatible, globally distributed, **multi-cloud**, provisioned inside the Fly org.
- **"This automatic global replication can replace a CDN and makes all your data available at low latency with zero configuration required."** — Fly's own docs. This is our CDN.
- Public bucket → `https://<bucket>.t3.tigrisfiles.io/<key>` (+ `.tigrisbucket.io`, `.tigrisblob.io` mirrors), custom domains via CNAME.
- Private by default; per-object ACLs can make single objects public-read.
- Access keys printed once at create; `flyctl` cannot retrieve later.
- Billed at provider list price, **and transfer to Tigris is billed separately as egress.**

---

## 3. The scale arithmetic

Assumptions: 10M MAU, 300M requests/month, 60% of traffic from Africa (Kenya primary), average response ~8 KB after gzip/brotli.

| Resource | Derivation | Result |
| --- | --- | --- |
| Storage | 10M users × ~100 KB avg (profile + applications + matches + doc metadata) + 5M opportunities × 5 KB + 5M embeddings × 6 KB | **~1.1 TB** → Neon Launch @ $0.35/GB-mo ≈ **$385/mo** |
| Neon compute | 300M req/mo ≈ 115 req/s avg, ~1,200 req/s peak. Primary 8 CU + 3 read replicas × 4 CU, ~12 CU sustained average | 12 × 730 = 8,760 CU-h × $0.106 ≈ **$930/mo** |
| Fly machines | Peak 1,200 req/s ÷ ~1,500 req/s per `shared-cpu-2x` = ~4 API machines; + 2 worker machines; spread over `jnb`, `fra`, `iad` | **~6–8 machines ≈ $150–400/mo** (varies by region) |
| Fly egress | 300M × 8 KB = 2.4 TB. 60% (1,440 GB) from `jnb` @ $0.12 = $173; 40% (960 GB) from `fra`/`iad` @ $0.02 = $19 | **~$192/mo** |
| Upstash Redis | ~1 Redis op per request = 300M ops. PAYG = 300M/100k × $0.20 = **$600/mo**. Fixed 10GB = **$200/mo** | **$200/mo (must use fixed plan)** |
| Tigris | ~50 TB user files (CVs, avatars) at list price | **~$1,150/mo** |
| Neon Auth | 10M MAU exceeds even Scale's 1M MAU cap | **self-host or multi-tenant — see §11** |

**Order-of-magnitude total at 10M MAU: $2,500–4,000 / month.** Storage and Tigris dominate; Fly's African egress is real but second-order (~$190). Neither is the free tier.

**The byte-efficiency insight:** because Africa egress is 6× Europe, every kilobyte removed from an African response is worth 6× a kilobyte removed from a European one. Response shaping is a *cost control*, not a nicety. This is the strongest argument in the whole document for GraphQL/sparse-fieldsets on mobile (§6).

---

## 4. Target architecture

```
                          ┌──────────────────────────────────────────────┐
   Web (Next.js)          │  Netlify CDN  (static, edge-cached, global)   │
   Mobile (Flutter)       └──────────────────────────────────────────────┘
                    │ REST /v1  ·  GraphQL /v1/graphql  ·  SSE /v1/stream
                    ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║  FLY.IO — anycast edge (Fly Proxy)                                        ║
║  TLS termination · autostop/autostart · concurrency limits · fly-replay   ║
║  health checks · sticky sessions (fly-force-instance-id)                  ║
╚═══════════════════════════════════════════════════════════════════════════╝
   │                      │                        │                    │
   ▼ jnb (Johannesburg)   ▼ fra (Frankfurt)        ▼ iad / ord           ▼ sin
 ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐  ┌───────────────┐
 │ app process   │  │ app process   │  │ app process      │  │ app process   │
 │ group ×N      │  │ group ×N      │  │ group ×N         │  │ group ×N      │
 │               │  │               │  │                  │  │               │
 │ worker group  │  │ worker group  │  │ worker group     │  │ worker group  │
 │ ×M (BullMQ)   │  │ ×M            │  │ ×M               │  │ ×M            │
 └───────┬───────┘  └───────┬───────┘  └────────┬─────────┘  └───────┬───────┘
         │                  │                   │                    │
         │  internal gRPC (:50051, private 6PN) │                    │
         └──────────────────┴───────────────────┴────────────────────┘
                             │
   ┌─────────────────────────┼──────────────────────────┬──────────────────┐
   ▼                         ▼                          ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌────────────────────┐ ┌─────────────────┐
│ UPSTASH REDIS    │ │ UPSTASH REDIS    │ │ NEON LAKEBASE      │ │ TIGRIS          │
│ region-local     │ │ region-local     │ │ POSTGRES           │ │ global object   │
 │ cache (evict on)│ │ queue (BullMQ)   │ │                    │ │ storage         │
 │ jnb / fra / iad │ │ per-region       │ │ primary rw compute │ │ (= the CDN)     │
 └──────────────────┘ └──────────────────┘ │ eu-central-1       │ └─────────────────┘
                                            │ + 3 read replicas  │
                                            │ (same region only) │
                                            └─────────┬──────────┘
                                                      │ logical replication
                                                      ▼
                                            ┌──────────────────┐
                                            │ NEON project #2  │
                                            │ (cross-region /  │
                                            │  analytics replica│
                                            └──────────────────┘
```

### The three hard geographic truths this diagram encodes

1. **No Postgres can live in Africa.** Neither Fly (`jnb` has no Managed Postgres) nor Neon (no African region) offers it. The nearest Neon region supporting the full primitive set is **`aws-eu-central-1` (Frankfurt)**.
2. **Therefore African reads must not come from Postgres.** They come from Redis (region-local), Tigris (global edge), and Netlify's CDN. Postgres is for the ~30% of requests that genuinely need fresh authoritative data, and those pay the jnb→fra latency.
3. **Writes always go to Frankfurt.** `fly-replay: region=fra` forwards the whole request through the edge back to Frankfurt — cheaper and faster than 3 round-trips from `jnb` to Frankfurt. Cross-region private transfer `jnb`→`fra` is $0.050/GB; same-region is free, so the write path is deliberately kept small.

**Expected latencies from Nairobi (estimates, to be measured):**
- Edge-terminated static + cached reads from `jnb`: 15–40 ms
- jnb-local Redis hit: 20–50 ms
- Frankfurt Postgres read (via replay): 130–180 ms
- Write (replay + Frankfurt commit): 150–250 ms
- Tigris edge fetch: 20–60 ms

---

## 5. Neon capability blend — what each primitive is for

| Primitive | Role in Job Radar | Why it, specifically |
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
| **GraphQL** `/v1/graphql` | **Yes — cost control, not novelty** | Mobile read paths: opportunity feed, match list, profile, applications list | **This is the egress argument.** A Kenyan user's feed fetched at 50 KB and shaped to 6 KB saves 88% of the response — at $0.12/GB that is the single highest-leverage optimization available. Also kills N+1 waterfall on 3G. `graphql-yoga` and the schema **already exist in `app.ts:140`** |
| **gRPC** `:50051` | **Yes — internal only** | Worker dispatch, service-to-service, bulk ingestion batches | Binary + HTTP/2 multiplexing is far cheaper than JSON for internal high-volume traffic. **Never exposed to browsers.** Already implemented |
| **MCP** `/v1/mcp` | **Yes — growth channel, not core** | Expose Job Radar search + matching as tools for Claude / Copilot / other agents | Already implemented with OAuth-protected-resource metadata. Not a product path; a distribution path. Fly has a dedicated MCP blueprint (`fly mcp`) for hosting |
| **SOAP** | **No — do not build** | — | SOAP's entire value is WS-Security + WS-* contracts with enterprise HR systems. There is no such partner. If a Kenyan employer (SAP SuccessFactors, a payroll vendor) ever mandates SOAP, add a **single thin endpoint** then. Building it now is pure cost with zero users |

**The deleted-path rule:** `apps/web/src/lib/graphql.ts` is dead code — web never calls GraphQL. Per the boundary rule it gets removed, and the GraphQL endpoint becomes mobile-first.

---

## 7. Data layer at 10M users

### Current state (measured)

44 tables. Zero partitioning. `notifications` has **only a primary key** — no index on `user_id`, `read`, or `created_at`. `matches` has only `(user_id, opportunity_id)`. Every user notification poll and every "top matches" query is a **seq scan**. These two are the highest-severity performance defects in the schema and they are invisible today because the tables are nearly empty.

### Sharding vs partitioning — the right first move

**Do not shard. Partition.** At 10M users the problem is table size, not database count.

- **User-owned tables** (`applications`, `matches`, `notifications`, `followups`, `documents`, `candidate_*`) → declarative **hash partitioning on `user_id`, 32 partitions**. This keeps each partition small, enables partition pruning on every user-scoped query (which is ~all of them), and is a pure DDL change — no application logic change.
- **Global catalog** (`opportunities`, `companies`, `opportunity_skills`, `profession_taxonomy`, `scam_signatures`) → **range partitioning on `posted_at` (monthly) + BRIN** for the time-ordered append pattern. 2,449 rows today; millions at scale.
- **Never shard the catalog** — it is shared, read-mostly reference data that every user sees.

Only when a *single primary compute* saturates (Launch allows 16 CU; Scale 56 CU) does real sharding become necessary — and at that point the move is **logical replication into additional Neon projects** (project-per-shard), which Neon natively supports. That is a plan change plus a routing layer, not a rewrite. This is exactly why partitioning-first is correct: it defers the irreversible decision until it is actually forced.

### Read replica routing

```
if (FLY_REGION !== PRIMARY_REGION) throw flyReplay("fra")   // writes
read  →  local replica if exists, else primary
```

Neon read replicas are **same-region only**, so `jnb` has no local replica. African reads therefore go: Redis → Tigris → (Frankfurt, paying latency). Only 3 read replicas exist on Free, and they are useless to Kenyan users — the replica strategy serves *throughput and analytics offload*, not African latency. Say this plainly rather than pretending replicas solve the geography.

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
- **One Redis DB per region** (`jnb`, `fra`, `iad`). Queues are region-local; only results are shared.
- **Eviction ON** for cache DBs, **OFF** for queue DBs (never lose a notification).
  Enforced at startup by `services/api/src/db/redis-policy.ts`, which reads
  `maxmemory-policy` and corrects it where the provider allows `CONFIG SET`.
  Upstash ships `optimistic-volatile` by default, which drops queued jobs
  silently — this is currently the biggest silent-failure risk in the stack.
- **Dead-letter queues** after 5 attempts, exponential backoff with jitter.
- **Idempotency** on every mutating endpoint via the `idempotency_keys` table from migration 012 — the same key returns the stored response instead of a second write. Mobile networks retry aggressively; without this, retries duplicate applications.
- **Switch to a fixed Upstash plan.** PAYG at $0.20/100k with BullMQ is a documented cost trap. At 300M ops/month PAYG is $600/mo vs $200/mo for fixed 10 GB.

---

## 9. Caching

Layer order: Netlify CDN (web static) → Fly edge → region-local Redis → Postgres.

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
| **Tigris** (Fly) | **All production user files**: CVs, avatars, generated PDFs, document versions | Global automatic replication — *the CDN is built in*. Low latency in Africa with zero config. S3-compatible, so `@aws-sdk/client-s3` already in the stack works unchanged |
| **Neon Object Storage** (5 GB free) | Branch-scoped fixtures and dev uploads only | Branches with the database, which is genuinely useful for testing upload flows — but only exists in 4 non-African AWS regions, so every Kenyan fetch would cross to Frankfurt |
| **Netlify** | Web static assets | Already hosts the marketing site; edge cache included |
| **Fly Volumes** | **Nothing.** | $0.15/GB/mo, region-locked, no replication. Not appropriate for user data |

Private buckets + presigned PUT from the backend. The backend signs, Tigris stores, the CDN serves. **Clients never hold storage credentials.**

---

## 11. Auth — the Google answer, and the boundary

### The blocked question, resolved

The deadlock was: Neon's `/sign-in/social` ignores `idToken` and always returns a redirect URL (verified by four probe payload shapes against the live deployment — all four returned `200 {"url": ".../sign-in/social/init?token=...","redirect":true}`), while Better Auth documents an `idToken` path that skips redirection. So the documented native flow does not work on this deployment.

**Resolution: use the redirect flow as the primary path. It requires no Google client ID from the user.**

```
1. Mobile opens a Custom Tab / ASWebAuthenticationSession to
     https://job-radar-api-angisoft.fly.dev/v1/auth/google/start
       ?state=<signed random>  &  redirect_uri=jobradar://auth/callback
2. Backend: store state in Redis (10 min TTL), respond 302 →
     Neon Auth /sign-in/social   { provider: "google",
                                   callbackURL: <API origin>/v1/auth/google/callback }
     with Origin: <API origin>   ← the API's trusted origin, never the client's
3. Neon → Google (Neon's OWN shared OAuth credentials) → Neon callback
4. Neon 302s the browser to the backend callback with a session cookie
5. Backend: read Set-Cookie, GET /token → Neon JWT
     → verify against NEON_AUTH_JWKS_URL → ensureLocalUserRecord()
     → issue Job Radar access token (HS256, 15 min) + rotating refresh token (30 d)
6. Backend 302s to jobradar://auth/callback#access_token=…&refresh_token=…
7. App closes the tab, stores tokens. Done.
```

This is exactly how LinkedIn, X and GitHub do native social sign-in. **No `google-services.json`, no iOS `GIDClientID`, no Google client ID from the user, no Gradle plugin.** The mobile app needs only a Custom Tab and a deep-link handler — `flutter_web_auth`-style, not `google_sign_in`.

The native `idToken` endpoint (`/v1/auth/google`) stays in `routes/auth.ts` as the fast path for **later**, once the project has its own OAuth web client ID for branded consent screens and Android/iOS. It is not required to ship.

### Token model (already implemented in `auth/tokens.ts`)

- **Access token:** HS256 JWT, `sub` = local `users.id`, issuer/audience `job-radar`, **15 minutes**, `jti`.
- **Refresh token:** 32-byte random, stored **hashed** (SHA-256) in `auth_refresh_tokens`, **30 days**, rotated on every use.
- **Reuse detection:** presenting an already-rotated token revokes the *entire family* — attacker and victim both forced to re-auth. This is the correct OAuth 2.1 behaviour and it is already built.
- `JWT_SECRET` is now actually used, and refuses to start in production under 32 chars.

### Boundary (from `ARCHITECTURE_BOUNDARIES.md`)

The backend owns identity. Clients receive Job Radar tokens and nothing else. `resolveIdentity` accepts **only** app-minted tokens; the Neon-JWT fallback has been removed. Mobile never touches `NEON_AUTH_BASE_URL`; web never proxies `/api/auth/*`.

---

## 12. AI layer

**AI Gateway is unavailable on Free** — it requires Launch/Scale plus $5 prepaid credits. Current options:

1. **Now:** call the existing `NVIDIA_AI_API_KEY` (already in `.env.local`) directly from the backend. Works today, zero cost change.
2. **On upgrade:** switch to Neon AI Gateway — one credential, OpenAI/Anthropic-compatible endpoints, per-branch scoping (dev branch can burn tokens without touching prod).

Either way: **the backend is the only caller.** Mobile and web call `/v1/ai/*` and never see a model key. This is already the shape of `routes/ai.ts`.

---

## 13. Observability

The user asked for Grafana specifically. Fly's own metrics pipeline feeds it:

| Signal | Source | Destination |
| --- | --- | --- |
| App metrics | `routes/metrics.ts` (Prometheus format, `recordHttpRequest` already wired in `app.ts:85`) | **Fly Metrics → Grafana** dashboards |
| Machine/system | Fly platform | Grafana |
| Neon Postgres | Neon console (1 day history on Free) | Neon dashboard |
| Neon Functions / Object Storage logs | `neon logs query --branch production --source function` | Loki → Grafana |
| App logs | `pino-http` + `logger.ts` (already wired) | `fly logs` / log drain → Loki |
| Distributed traces | **missing — add OpenTelemetry** | Grafana Tempo or Jaeger |
| Error tracking | **missing — add Sentry or GlitchTip** | alerts |
| Uptime / synthetic | `fly checks` + `/live`, `/health` | Grafana alerts |

**Gaps to close:** OpenTelemetry traces (a request that crosses jnb → fra → Postgres → Redis → BullMQ is invisible without them), and synthetic checks from an African vantage point — `jnb` health checks do not tell you what a Kenyan user experiences.

---

## 14. Cost model

| Line | At 10M MAU | Free tier? |
| --- | --- | --- |
| Neon storage (~1.1 TB) | ~$385 | ❌ 1 GB |
| Neon compute (~8,760 CU-h) | ~$930 | ❌ 100 CU-h |
| Neon Auth (10M MAU) | exceeds Scale cap → self-host or partition | ❌ 60k MAU |
| Fly machines (6–8, multi-region) | ~$150–400 | ❌ no free tier |
| Fly egress (~2.4 TB, 60% Africa) | ~$192 | n/a (always billed) |
| Upstash Redis (fixed 10 GB + 1 read region) | ~$300 | n/a |
| Tigris (~50 TB files) | ~$1,150 | n/a |
| **Total** | **~$2,500–4,000 / month** | |

Free tier realistically carries **50k–100k MAU** for $0 (modulo Fly machine cost, which is never $0).

---

## 15. Migration plan

Extends P0–P5 in `ARCHITECTURE_BOUNDARIES.md`.

| Phase | Work | Unblocks |
| --- | --- | --- |
| **P1 — Auth boundary** *(done)* | `authRouter` mounted at `/v1/auth` **ahead of** the identity middleware; API-owned passwords; refresh rotation + reuse detection; migrations 012–016; contract types; 25-check verification suite green against production | Backend owns identity |
| **P1b — Production wiring** *(done)* | `NEON_AUTH_OAUTH_CLIENT_ID`, `AUTH_OAUTH_REDIRECT_ALLOWLIST` and a 48-char `JWT_SECRET` in `fly secrets`; Redis eviction policy corrected at startup | Sign-in works outside localhost |
| **P2 — Cut clients off Neon** *(done)* | `neon_auth_service.dart` deleted; cookie `token_storage.dart` removed; mobile → Custom Tab flow; the web `/api/auth` route is now a same-origin relay to the API. **No backward compatibility** | Boundary is real |
| **P3 — Schema at scale** *(next)* | Migration 013 (the indexes in §7); `pg_stat_statements`; autovacuum tuning; verify index usage with `EXPLAIN` | Reads stop seq-scanning |
| **P4 — Partition** | Hash-partition user tables on `user_id` ×32; range-partition `opportunities` on `posted_at` | Table size stops mattering |
| **P5 — Region + replica** | `fly-replay` middleware (already scaffolded in `error-handler.ts`); deploy to `jnb` + `fra`; read replica routing; region-local Redis | Global latency |
| **P6 — Protocol blend** | Mobile reads → GraphQL; worker → gRPC; MCP hosted on its own autostop Machine; delete dead web GraphQL client | Cost + throughput |
| **P7 — Observability** | OTel traces, error tracking, African synthetic checks, Grafana dashboards | Operability |
| **P8 — Upgrade** | Neon Launch; AI Gateway on; Functions for long-running streams; Realtime where polling exists | Past 100k MAU |

> **Local ≠ production.** Three defects were invisible locally and broke production outright:
> the auth router sat *behind* the identity middleware (so nobody could obtain a token — masked
> locally by `DEMO_MODE`), `JWT_SECRET` was unset (the API refuses to sign tokens in production
> without a real one), and Redis ran `optimistic-volatile` (queued jobs evaporate at the memory
> limit). Details and fixes: `ARCHITECTURE_BOUNDARIES.md` §7.5. Verify in production, not just
> locally.

### CI gates
1. `npm run typecheck` (API) + `@angisoft/job-radar-web` typecheck — must pass.
2. **No client may import a Neon/provider SDK.** Failure if `apps/web/**` or `apps/mobile/**` references `neonauth`, `NEON_AUTH_BASE_URL`, `neon.tech`, or any `AWS_*` key.
3. **No direct provider DB strings in clients.** Only `https://job-radar-api-angisoft.fly.dev/v1` (or a config-injected origin) may appear.
4. Migrations must be additive and safe on existing data (`CREATE INDEX CONCURRENTLY`, no destructive column drops in the same release as the code that stops using them).

### Acceptance checklist

- [x] Mobile Google sign-in completes end-to-end with **zero** Google client *secrets* in the repo or in `fly secrets`. (The OAuth `client_id` is a public identifier by design and is set on Fly; the flow needs no secret at all — the Neon client is a PKCE public client.)
- [x] No mobile/web code path reaches Neon, S3, or any provider directly — enforced by `npm run check:boundaries` in CI.
- [x] `/v1/auth/*` returns `Cache-Control: no-store`; rate limits enforced.
- [x] Refresh rotation + reuse detection verified (reuse kills the family) — `verify-auth.mjs`.
- [ ] Every `EXPLAIN` on the four hottest queries uses an index, not a seq scan.
- [ ] A write from `jnb` is replayed to `fra`; a read is served locally.
- [ ] p95 from Nairobi measured and recorded (currently unknown — there is no African vantage point).
- [ ] Load test at 1,200 req/s peak on a staging branch before Launch upgrade.

---

## 16. Open questions for you

1. **Google branding.** Do you want the zero-config redirect flow (ships now, no client ID), or branded consent screens + true native `google_sign_in` (needs a Google OAuth web client ID — one-time, ~10 minutes in Google Cloud Console)? Recommendation: **ship the redirect flow this week, add the client ID later.** The switch is one config value plus one client change.
2. **Neon plan.** Confirm you are ready to move to **Launch** when storage crosses ~800 MB. I can set a threshold alert.
3. **Region priority.** Is `jnb` (Johannesburg) acceptable as the African edge for Kenyan users, given Nairobi–Johannesburg is ~60 ms and there is no closer Fly region?
4. **AI provider.** Stay on the direct NVIDIA key, or upgrade Neon to Launch for AI Gateway?
5. **SOAP.** Is there a specific enterprise partner that requires it? If not, my recommendation is not to build it — say the word and I'll add one thin endpoint.

---

## Appendix — verified sources

- Neon plans, read replicas, regions, Functions, AI Gateway: `neon.com/docs/introduction/plans`, `/introduction/read-replicas`, `/compute/functions/overview`, `/ai-gateway/overview`, plus `Neon.list_regions()` (11 regions, zero African) and `Neon.list_organizations()` (org plan = `free`).
- Fly pricing, regions, Upstash, Tigris, fly-replay: `fly.io/docs/about/pricing`, `docs.fly.io/reference/regions.md`, `docs.fly.io/upstash/redis/`, `docs.fly.io/tigris/`, `docs.fly.io/blueprints/multi-region-fly-replay/`.
- Better Auth / Neon Auth Google: `better-auth.com/docs/authentication/google`, `neon.com/docs/auth/guides/setup-oauth`, `neon-auth` skill `references/managed-auth.md`.
- Live probes: Neon Auth `/sign-in/social` × 4 payload shapes (all returned redirect URLs), `/token` (401 without challenge cookie).
