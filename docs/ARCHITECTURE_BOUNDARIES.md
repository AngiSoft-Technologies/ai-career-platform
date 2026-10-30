# Job Radar — Client / Backend Boundary Architecture

> **Status:** implemented. The boundary described here is enforced by
> `npm run check:boundaries` in CI (`.github/workflows/ci.yml`).
> **Scope:** `apps/web` (Next.js), `apps/mobile` (Flutter), `services/api` (Express on Fly.io),
> `packages/contracts`.
> **Applies to:** every network call, every credential, every piece of business logic.
>
> **Last verified:** 2026-10-30 — `npm run check` passes, `npm run build` passes,
> `flutter analyze` and `flutter test` pass, and
> `node services/api/scripts/verify-auth.mjs` passes 25/25 against the live API
> (`https://job-radar-api-angisoft.fly.dev/v1`).

---

## 1. The rule

**The backend running at `https://job-radar-api-angisoft.fly.dev` is the only component that
talks to identity providers, databases, object storage, and third-party APIs. Web and mobile are
thin clients that call the backend and render the result.**

Corollaries, in priority order:

1. **One network ingress per client.** `https://job-radar-api-angisoft.fly.dev/v1` plus the
   realtime endpoints mounted under it (`/v1/ws`, `/v1/stream`). Nothing else.
2. **No client holds a credential that belongs to a provider.** A JWT minted *by Job Radar* is
   fine. A Neon Auth session cookie, a provider URL, or a third-party secret is not.
3. **No client owns a business rule.** Status machines, permission checks, quota rules, pricing,
   matching, scoring, initial state, defaults, and transition validity live in `services/api`
   and are *published* to clients as data (`availableTransitions`, `permissions`, `limits`) or
   enforced on write and reported as normalized errors.
4. **Clients may cache and optimistically render, but never invent server state.** A local row
   created offline is a *draft with a client-generated idempotency key*, not a server record.
5. **Providers are implementation details.** Neon, S3, Google, n8n and the LLM vendor must be
   replaceable by a backend deploy, with no app-store release and no frontend change.
6. **Every surface a client may use is versioned and documented.** `packages/contracts` is the
   single source of truth; the OpenAPI document is authoritative for REST.

SOAP is not used anywhere in this repository and should not be introduced. The transport choices
are REST (canonical, both clients), WebSocket/SSE (realtime, through the API), and gRPC
(server-internal only — `services/api/src/grpc/server.ts`, consumed by the matching service via
`MATCHING_GRPC_URL`). GraphQL exists but currently has no consumer (see V9).

---

## 2. Allowed egress — exhaustive

| Destination | Web | Mobile | Allowed | Condition |
|---|---|---|---|---|
| `job-radar-api-angisoft.fly.dev/v1/*` | yes | yes | ✅ | Only via `apps/web/src/lib/api.ts` / `apps/mobile/lib/core/networking/api_client.dart` |
| `/v1/ws`, `/v1/stream` (same host) | yes | yes | ✅ | Bearer token, through the API |
| Neon Auth (`*.neonauth.*.neon.tech`) | ❌ | ❌ | ⛔ | Backend only |
| Neon Postgres | ❌ | ❌ | ⛔ | Backend only |
| Redis | ❌ | ❌ | ⛔ | Backend only |
| S3 / object storage | ❌ direct | ❌ direct | ⚠️ | Only a short-lived presigned URL issued by `POST /v1/documents/upload-url` |
| Google identity endpoints | ❌ | ❌ | ⛔ | The Google OAuth client is registered to the identity provider only. The API runs the handshake. |
| Gmail / connected accounts | ❌ | ❌ | ⛔ | OAuth start + callback are backend routes (`/v1/connections/*`) |
| LLM provider | ❌ | ❌ | ⛔ | Backend only |
| n8n | ❌ | ❌ | ⛔ | Backend only |
| Employer career sites | — | ✅ | ✅ | `WebView` / `launchUrl`, untrusted third-party content, no credentials |
| Marketing CDN / static assets | ✅ | ✅ | ✅ | Presentation only |

Rule of thumb: if a destination appears in a client bundle or a mobile binary, it must be on this
table with a ✅.

### 2.1 The one exception, and why it is not one

The web app keeps a same-origin route at `/api/auth/[...path]`. It is **not** a second auth backend:
it is a transport relay with no identity logic. It forwards to `GET|POST /v1/auth/neon/*` on the
API, and the API forwards to the identity provider.

It exists because two steps of the OAuth authorization flow have to run inside the session the
provider created (`/sign-in/social` and `/oauth2/continue`). Relaying through the app's own origin
keeps the provider cookie a **first-party** cookie instead of a third-party one, which browsers
block. The rules still hold:

- the browser never addresses the provider host;
- the browser never sees a provider token — only the API redeems the authorization code;
- the relay accepts a fixed allowlist of provider paths
  (`services/api/src/auth/providers/neon-gateway.ts`) and rejects everything else with `404`;
- the provider host is not in the client bundle: the relay resolves the API from
  `NEXT_PUBLIC_API_URL`.

`npm run check:boundaries` fails if the provider host, a provider SDK or a provider environment
variable reappears anywhere under `apps/web/src` or `apps/mobile/lib`.

---

## 3. Violations — status

Severity: **S1** breaks a security or correctness boundary · **S2** causes drift and incidents ·
**S3** dead code / hygiene.

| # | Violation | Where | Sev | Status | Consequence |
|---|---|---|---|---|---|
| V1 | Mobile calls Neon Auth directly | `apps/mobile/lib/core/authentication/neon_auth_service.dart` | **S1** | ✅ fixed | File deleted. Replaced by `core/authentication/api_auth_service.dart`, which only calls the API. |
| V2 | Mobile persists the provider session cookie on device | `token_storage.dart` | **S1** | ✅ fixed | `TokenStorage` now holds only the API's access and refresh tokens. |
| V3 | Mobile asserts its own `Origin` header | `neon_auth_service.dart` | **S1** | ✅ fixed | The mobile app sends no provider requests, so it asserts no origin. |
| V4 | Web runs a second auth backend | `apps/web/src/app/api/auth/[...path]/route.ts` | **S1** | ✅ fixed | The route now forwards to `/v1/auth/neon/*` on the API and holds no identity logic. See §2.1. |
| V5 | Neon upstream URL shipped to the browser bundle | `apps/web/src/lib/auth.ts` | S2 | ✅ fixed | `NEXT_PUBLIC_NEON_AUTH_URL` is gone from client code. |
| V6 | Application state machine duplicated in Dart | `apps/mobile/lib/features/applications/domain/job_application.dart` | **S2** | ⬜ open | Still duplicated; the server already publishes `availableTransitions`. |
| V7 | Client fabricates server state on offline create | `application_repository.dart` | S2 | ⬜ open | Offline create still asserts `status`/`version`. Needs a server-assigned draft shape. |
| V8 | Contracts are not enforced for Dart | `packages/contracts/openapi.yaml` | **S2** | ⬜ open | The OpenAPI document now covers `/v1/auth/*`; no Dart generator yet. |
| V9 | Dead GraphQL client and unowned GraphQL mounts | `apps/web/src/lib/graphql.ts`, `services/api/src/app.ts` | S3 | ✅ fixed | `apps/web/src/lib/graphql.ts` deleted. The server keeps GraphQL for internal and future read paths. |
| V10 | Demo mode acts as an identity bypass, default-on | `app_settings.dart`, `resolve-identity.ts` | **S1** | ✅ fixed | `resolve-identity.ts` accepts only app-minted tokens (`source: "app" \| "demo"`); no provider JWT. |
| V11 | Client parses provider error shapes | `neon_auth_service.dart` | S2 | ✅ fixed | The API returns stable codes (`AuthErrorCode` in `packages/contracts`). |

The Google sign-in failure was a direct product of V1 + V4 + V10: mobile reimplemented an auth flow
the backend never owned, and the provider's actual behaviour (documented in §7.3) never matched
the assumption in the client.

---

## 4. Target architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  apps/web (Next.js)          │        │  apps/mobile (Flutter)       │
│  render · cache · forms      │        │  render · cache · outbox     │
│  lib/api.ts = only transport │        │  ApiClient  = only transport │
│  /api/auth = cookie relay    │        │  Custom Tab + deep link      │
└──────────────┬───────────────┘        └──────────────┬───────────────┘
               │  HTTPS + Bearer (app token)          │
               └───────────────┬──────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  services/api  — Fly.io                                             │
│                                                                     │
│  middleware/     identity · rbac · rate-limit · error-handler       │
│  routes/         v1.ts  (profile, opportunities, applications, …)   │
│                  auth.ts  (sign-in, sign-up, google, refresh, reset)│
│  auth/           tokens · passwords · credentials · identities       │
│                  providers/ (neon-oauth, neon-gateway, google)       │
│  db/             pool · redis · migrations                          │
│  realtime/       hub · ws · sse                                     │
│  grpc/           internal matching surface                          │
└───────┬──────────────────────┬──────────────────────┬───────────────┘
        │                      │                      │
        ▼                      ▼                      ▼
  Neon Postgres            Neon Auth              S3 · LLM · n8n
  (data, credentials)      (OAuth 2.1 server)      (server-to-server only)
```

### Ownership matrix

| Concern | Owner | Clients may |
|---|---|---|
| Credential exchange, session issuance, refresh, revocation | `services/api/src/routes/auth.ts` | call `/v1/auth/*` |
| Password hashing and verification | `services/api/src/auth/passwords.ts` | never see a hash |
| Identity → app user mapping, roles, permissions | `auth/identities.ts`, `auth/neon-auth.ts` | read `GET /v1/me` |
| Application state machine & versioning | `packages/contracts` + `services/applications.ts` | read `availableTransitions`, write `{status, version}` |
| Validation of every write | zod schemas in `routes/*` | send the documented shape |
| Matching / scoring | `services/matching.ts` | read `/v1/matches` |
| Documents, export, storage signing | `services/documents.ts`, `services/storage.ts` | call API; use returned presigned URL |
| Provider credentials & URLs | `config.ts` + Fly secrets | never see them |
| Offline cache, optimistic UI, formatting, platform APIs | clients | — |

---

## 5. Client contract

These rules apply identically to web and mobile. Any deviation is a review blocker.

### 5.1 Identity

- The client obtained **one** token from `POST /v1/auth/*`. It is a Job Radar token.
- The client sends `Authorization: Bearer <token>` and nothing else.
- On `401`, the client calls `POST /v1/auth/refresh` **once**, retries once, then signs out.
- The client never stores a provider cookie, never constructs a provider URL, never sends `Origin`
  as a security signal, and never reads provider error payloads.
- The client has no knowledge of Neon, JWKS, providers, or session cookies.

### 5.2 Errors

Every non-2xx response is the same shape (already the convention in
`services/api/src/middleware/error-handler.ts`):

```json
{ "error": "Human readable message", "code": "STABLE_CODE", "requestId": "..." }
```

Clients branch on `code`, display `error`, and log `requestId`. Clients must not string-match
messages. Auth codes are fixed: `INVALID_CREDENTIALS`, `EMAIL_IN_USE`, `WEAK_PASSWORD`,
`TOKEN_EXPIRED`, `TOKEN_INVALID`, `PROVIDER_REJECTED`, `ACCOUNT_DISABLED`, `INVITE_REQUIRED`.

### 5.3 Offline & optimistic writes

Cache and outbox are legitimate client concerns. Inventing server state is not.

- A write while offline is stored with a client-generated `Idempotency-Key` (UUIDv4).
- The local row is a **draft**: it carries `pending: true` and a client id, never a fabricated
  `version`, server `status`, or `userId`.
- Replay sends the same `Idempotency-Key`; the backend returns the original result for duplicates.
- Server-computed fields (`version`, `status`, `appliedAt`, ids) are only ever taken from a
  response.
- On replay rejection (`4xx`), the client drops the draft and surfaces the server code. It must
  not silently retry.

### 5.4 Contracts

- REST shapes are defined in `packages/contracts/openapi.yaml`.
- TS consumers import `@angisoft/job-radar-contracts`; the API and web already do.
- Flutter must consume a **generated** client (see §8), not hand-written `fromJson`.
- Additive changes only within `/v1`. Breaking changes go to `/v2`. Every response carries
  `x-api-version` (`services/api/src/app.ts:50-54`).

### 5.5 Realtime & files

- Realtime only via `WS_URL` derived from the API URL (`/v1/ws`) or `/v1/stream` SSE.
- File bytes move through a presigned URL returned by the API; the client never holds S3
  credentials and never constructs a bucket URL.

---

## 6. Backend contract (what the backend must own)

1. **Auth surface.** `services/api/src/routes/auth.ts`, mounted in `routes/v1.ts`:
   `POST /auth/sign-up`, `POST /auth/sign-in`, `POST /auth/google`, `POST /auth/refresh`,
   `POST /auth/sign-out`, `GET /auth/session`, `POST /auth/invitations/:token/accept`.
2. **Provider adapters.** `services/api/src/auth/providers/` — one module per identity source.
   Neon Auth and Google ID-token verification are adapters behind an interface; `resolve-identity`
   depends on the interface, not the vendor.
3. **State machines as data.** Application payloads include `availableTransitions` so clients
   render options without owning the table. The canonical table stays in
   `packages/contracts/src/index.ts:23-41`.
4. **Idempotency.** `Idempotency-Key` accepted on `POST`/`PATCH` from the offline outbox; stored
   with the response for 24h.
5. **Normalized errors.** Provider failures are mapped at the adapter boundary. No vendor message
   reaches a client.
6. **Rate limits and audit apply to auth.** `/v1/auth/*` sits behind the same limiter
   (`app.ts:55-66`) and writes an audit row on success and failure.
7. **Secrets fail closed.** `JWT_SECRET` (`config.ts:54`) is currently declared and unused; when it
   becomes the signing key it must have no default in production and the process must refuse to
   boot without it.

---

## 7. Auth redesign (the flagship change)

### 7.1 Endpoints

```
POST /v1/auth/sign-up            { email, password, name }     → 201 AuthSession
POST /v1/auth/sign-in            { email, password }           → 200 AuthSession
POST /v1/auth/google             { idToken, nonce? }           → 200 AuthSession
GET  /v1/auth/google/start?redirect_uri=…                      → 302 provider
GET  /v1/auth/google/callback    (provider)                    → 302 app#fragment
POST /v1/auth/google/link-ticket (Bearer)                      → 200 { ticket }
GET  /v1/auth/google/link/start?ticket=…&redirect_uri=…         → 302 provider
POST /v1/auth/password/reset-request { email }                 → 202
POST /v1/auth/password/reset     { token, password }           → 200 AuthSession
POST /v1/auth/refresh            { refreshToken }              → 200 AuthSession
POST /v1/auth/sign-out           { refreshToken? }             → 204
GET  /v1/auth/session            (Bearer)                      → 200 session state
ANY  /v1/auth/neon/*             (allowlisted provider paths)  → relayed
```

`AuthSession` is `{ token, tokenType, expiresAt, refreshToken, refreshExpiresAt, user, roles,
permissions }`. `user` matches `GET /v1/me`'s `user` object so clients have one shape. The whole
shape is published in `packages/contracts/openapi.yaml` and
`packages/contracts/src/index.ts`.

### 7.2 Token model

| Token | Form | TTL | Storage | Notes |
|---|---|---|---|---|
| Access | JWT, HS256 (`JWT_SECRET`) | 15 min | client secure storage / localStorage | `iss=job-radar`, `sub=<app user id>`, `aud=job-radar`, `jti`, `iat`, `exp` |
| Refresh | opaque 32-byte random | 30 days | hashed in `auth_refresh_tokens` | rotated on every use, reuse detection revokes the family |
| Provider session | never leaves the API | — | provider-side only | not addressable by clients |
| Password hash | scrypt, per-user salt | — | `auth_password_credentials` | the API verifies it; no provider is involved |

`resolve-identity.ts` accepts exactly one token path: a Job Radar access token verified locally.
The provider-JWT fallback was removed — there is no backward-compatibility branch.

### 7.3 The identity provider, as verified

Probed against production on 2026-10-29 and re-verified on 2026-10-30:

- The provider publishes `/.well-known/openid-configuration`: it is a full **OAuth 2.1 / OIDC
  authorization server** with `/oauth2/authorize`, `/oauth2/token`, PKCE `S256`, public clients
  (`token_endpoint_auth_method: none`) and **dynamic client registration** at `/oauth2/register`.
- `POST /sign-in/social` returns `200 {"url":".../sign-in/social/init?token=…","redirect":true}` and
  **ignores an `idToken` in the body** — the ID token is not exchanged for a session.
- `GET /token` with only the returned challenge cookie returns `401 UNAUTHORIZED`.
- The provider's email/password path issues **no session until the address is verified**:
  `POST /sign-up/email` returns `{"token":null}` and `POST /sign-in/email` answers
  `403 EMAIL_NOT_VERIFIED`.
- The Google OAuth client registered to the provider is the only one whose redirect URI is
  accepted by Google. A direct `accounts.google.com` authorization request from the API's own
  redirect URI is rejected with `redirect_uri_mismatch`.

Three consequences, all of which shaped the implementation:

1. **Passwords are owned by the API.** The provider's credential store cannot issue a usable
   session without a verified email address, so the API hashes and verifies passwords itself
   (`services/api/src/auth/passwords.ts`, `auth_password_credentials`). This also removes the
   "check your inbox before you can sign in" dead end.
2. **Google is owned by the API through the provider's OAuth server.** The API registers itself as
   a PKCE public client and runs the authorization-code flow. No Google client id is needed in the
   app, no `google-services.json`, no iOS `GIDClientID`, no Android Gradle plugin.
3. **The provider session never reaches a client.** The API redeems the authorization code and
   mints Job Radar tokens; the browser only receives a redirect.

### 7.4 The Google flow, end to end

```
client                     API                          provider                Google
  │  GET /auth/google/start?redirect_uri=jobradar://auth/callback
  │ ─────────────────────►│
  │                         │  GET /oauth2/authorize (PKCE, client_id, redirect_uri=API callback)
  │                         │ ──────────────────────────►│
  │                         │                             │  302 login page + signed request
  │  302 ──────────────────│◄─────────────────────────────│
  │ ──────────────────────►│ (browser follows the redirect to the login page)

login page (web)           API                          provider
  │  POST /api/auth/sign-in/social { provider, oauth_query }
  │ ──────────────────────►│  POST /neon/sign-in/social  │ ──────────►│
  │                         │ ◄───────────────────────── │  init url  │
  │  ◄──── { url } ────────│                            │             │
  │  browser follows the init url ───────────────────────────────────────►│
  │                                                    ◄── consent ─────│
  │                                                    │  callback/google
  │  ◄── 302 login page + signed request (provider session now set) ────│
  │  POST /api/auth/oauth2/continue { oauth_query }
  │ ──────────────────────►│  POST /neon/oauth2/continue│
  │                         │ ◄──── { url: API callback?code=…&state=… } │
  │  browser follows it ──────────────────────────────────────────────►│
  │                         │  GET /auth/google/callback
  │                         │  POST /oauth2/token (code + PKCE verifier)
  │                         │ ──────────────────────────►│
  │                         │ ◄──── { id_token } ─────────│
  │                         │  verify against provider JWKS
  │                         │  map identity → app user, mint Job Radar tokens
  │  302 jobradar://auth/callback#access_token=…&refresh_token=…
  │ ◄──────────────────────│
```

Properties that matter:

- The **code verifier never leaves the API** (`auth_oauth_states`).
- The **provider session is never exposed to the client**; the browser only carries the relay's
  first-party cookie.
- The **redirect target is allowlisted** (`AUTH_OAUTH_REDIRECT_ALLOWLIST`), so a crafted
  `redirect_uri` cannot harvest the freshly minted tokens.
- The **same flow serves web and mobile**: the web redirects to `/auth/callback`, mobile to
  `jobradar://auth/callback`, and the tokens travel in the URL fragment so they are never sent to
  a server, logged or stored in browser history.

### 7.5 Production wiring that is not optional

Three defects were invisible locally and unrecoverable in production. All three are now fixed and
covered by the verification suite; they are recorded here because each one is a trap that any
future environment will fall into again.

**1. The auth router was mounted behind the identity middleware.**
`app.use(identity)` runs before `app.use("/v1", v1Router)`, and it rejects any request without a
token. That is correct for every resource — and fatal for `/v1/auth/*`, which is *how* a client
obtains a token: sign-up, sign-in and `/auth/google/start` all returned `401` in production. Locally
the bug could not appear, because `DEMO_MODE` defaults to on outside production and hands every
anonymous caller a demo identity, which satisfies the middleware.

The fix is ordering, not policy: `authRouter` is mounted *before* `identity` and resolves the
caller itself — no token is anonymous, an invalid token is `401`, a valid token is available to the
endpoints that need one, and there is deliberately **no demo fallback** in the auth router. A session
must be either proven or absent.

**2. `JWT_SECRET` was not set in production.**
`accessSecret()` refuses to mint a token when the secret is missing, equals the development default,
or is shorter than 32 characters — so the API returned `503 AUTH_NOT_CONFIGURED` for every sign-in.
This guard is correct and worth keeping; the failure was operational. The secret is set on Fly and
kept out of the repository (`.env.production`, git-ignored). Rotating it invalidates access tokens
immediately (15-minute TTL); refresh tokens are opaque and hashed, so they are unaffected.

**3. Redis ran with an `optimistic-volatile` eviction policy.**
Upstash's default silently drops keys at the memory limit — including queued jobs and their locks —
which surfaces as "a job went missing" rather than an error. BullMQ requires `noeviction`.

Verified directly against the live database: Upstash does **not** expose this parameter to clients.
`CONFIG GET maxmemory-policy` answers `[]` and `CONFIG SET maxmemory-policy` fails with *"Unknown
option or number of arguments"*. The policy cannot be corrected from inside the app; it is a
per-database setting in the Upstash console and must be changed there.

`services/api/src/db/redis-policy.ts` therefore does what the app *can* do: it reads the policy at
startup, corrects it where the provider allows `CONFIG SET` (self-hosted Redis), and otherwise logs
a loud, actionable warning naming the exact setting to change. The check is advisory — Redis is not
on the request path, so a managed instance that forbids `CONFIG` must still boot.

The general rule: **anything that differs between local and production has to be proven in
production.** Local verification with `DEMO_MODE` on proves the logic, not the wiring.

### 7.6 Migration compatibility

There is none, by design. There is no provider-token path, no provider-cookie path and no legacy
sign-in route in either client.

---

## 8. Contract enforcement (so this doesn't regress)

| Gate | Mechanism | Status |
|---|---|---|
| No provider hostnames, SDKs or environment variables in clients | `npm run check:boundaries` — `scripts/check-boundaries.mjs` scans `apps/web/src` and `apps/mobile/lib` for `neonauth`, `neon.tech`, `@neondatabase/auth`, `NEON_AUTH_*`, `google_sign_in`, direct `pg` access and absolute URLs on network-call lines | ✅ blocking in CI |
| No provider URL in the client bundle | Same gate: the provider host is a forbidden pattern and the relay resolves the API from `NEXT_PUBLIC_API_URL` | ✅ blocking |
| One transport per client | `apps/mobile/lib/core/networking/api_client.dart` is the only transport; `ApiAuthService` is the only other module that calls `http`, and it calls the API | ✅ by review |
| Contract drift | `packages/contracts/openapi.yaml` is authoritative and covers every `/v1/auth/*` route; the TS types are hand-maintained | ⬜ OpenAPI → Dart generator still missing |
| No duplicated state machine | `APPLICATION_STATUS_TRANSITIONS` may appear only in `packages/contracts`; the Dart copy is still there | ⬜ open (V6) |
| Review checklist | Any new outbound URL, credential, or business rule in a client requires an entry in §2 and an owner in §4 | process |
| Auth end-to-end | `node services/api/scripts/verify-auth.mjs [baseUrl]` — sign-up, sign-in, refresh rotation, family revocation on reuse, sign-out, Google start with PKCE, redirect allowlist, provider relay allowlist, protected-resource gating and `x-user-id` impersonation | ✅ 25/25 green against production |

The suite is the reason the auth boundary is now *proven* rather than asserted. It talks HTTP to
the API only — no database, no provider — so it fails loudly if the boundary or the wiring is
broken in any environment, not just locally.

The gate is intentionally a readable grep rather than a linter: the rules are simple enough to
review in one sitting, and the failure message points at the exact file and line.

## 9. Migration plan — as executed

| Phase | Work | Status |
|---|---|---|
| **P0 — freeze** | Document §2; add the boundary gate | ✅ done |
| **P1 — backend auth** | `routes/auth.ts`, token module, refresh-token store, identity mapping, `resolve-identity` accepts app tokens only | ✅ done |
| **P2 — mobile cutover** | Delete `neon_auth_service.dart`; add `api_auth_service.dart`; drop the provider cookie from `token_storage.dart`; remove `google_sign_in` | ✅ done |
| **P3 — web cutover** | `lib/auth.ts` calls `/v1/auth/*`; the `/api/auth` route becomes a relay to the API; remove `NEXT_PUBLIC_NEON_AUTH_URL`; add `/auth/callback` and `/reset-password` pages | ✅ done |
| **P4 — remove bypass** | Provider-JWT acceptance removed; provider credential store removed from the sign-in path; `graphql.ts` deleted | ✅ done |
| **P5 — enforce** | Blocking CI gate, CI workflow, OpenAPI covers `/v1/auth/*` | ✅ done (except the Dart generator) |

Remaining, tracked as V6/V7/V8 above: the duplicated Dart state machine, the offline-create
fabrication, and the missing OpenAPI → Dart generator.

---

## 10. What stays in the client (do not over-correct)

Removing the violations above does **not** mean moving everything server-side. These are
legitimate client responsibilities and must remain:

- Rendering, navigation, theming, accessibility.
- Local cache (SQLite / localStorage) and offline outbox.
- Optimistic UI with rollback.
- Input formatting and *pre*-validation (the server still validates).
- Platform capabilities: camera, file picker, share sheet, deep links, push, secure storage.
- Opening employer sites in a WebView or external browser.
- Feature flags and copy, as returned by the API.

The distinction is: **clients decide how something looks and feels; the backend decides what is
true.**

---

## 11. Non-goals

- Rewriting the API in another stack.
- Introducing SOAP or a second RPC paradigm for clients.
- Moving the offline cache to the server.
- Changing the public marketing content routes; they already go through `/v1/content`.
- Multi-region or performance work.

---

## 12. Open decisions

1. **GraphQL:** resolved — the dead client is deleted. The server keeps `/v1/graphql` for internal
   and future read paths; mobile reads stay on REST for now.
2. **Refresh token storage:** resolved — the refresh token lives in `flutter_secure_storage` on
   mobile and `localStorage` on the web, and rotates on every use. A future hardening step can move
   the web token behind an httpOnly cookie without changing the API.
3. **Google option:** resolved — §7.4, option B in its OAuth 2.1 form. Option A was impossible: the
   API cannot obtain a Google ID token without a registered redirect URI.
4. **Invite-only signup:** still a business decision the backend must own. `POST /v1/auth/sign-up`
   is currently open and rate-limited.

## 13. Acceptance criteria

The boundary is clean when all of the following are true:

- [x] `grep -rn "neonauth\|neon.tech" apps/web/src apps/mobile/lib` returns nothing.
- [x] `apps/mobile/lib` contains exactly one file that imports `package:http` for data, plus
      `api_auth_service.dart` which calls the API only.
- [x] No client stores a cookie belonging to any provider.
- [x] `packages/contracts/openapi.yaml` documents every endpoint either client calls, including
      `/v1/auth/*`.
- [x] Rotating the identity provider requires only a backend deploy.
- [ ] `APPLICATION_STATUS_TRANSITIONS` exists in one place only. *(open — V6)*
- [ ] No offline write fabricates `version`, `status`, or `userId`. *(open — V7)*
- [ ] Every client-visible error has a stable `code` from the backend. *(mostly done; the Dart
      client still surfaces raw messages for some endpoints)*
- [x] CI fails on any new direct provider call from a client.

---

## Appendix A — Evidence index

| Claim | Source |
|---|---|
| Provider is an OAuth 2.1 server with PKCE and dynamic registration | `/.well-known/openid-configuration` on the provider origin |
| Provider ignores `idToken` in `POST /sign-in/social` | live probe, 2026-10-29 |
| Provider issues no session until the email is verified | `POST /sign-up/email` → `{"token":null}`, `POST /sign-in/email` → `403 EMAIL_NOT_VERIFIED` |
| Google's registered redirect URI belongs to the provider only | `accounts.google.com/o/oauth2/v2/auth` answers `redirect_uri_mismatch` for the API callback |
| The provider path allowlist | `services/api/src/auth/providers/neon-gateway.ts` |
| The relay holds no identity logic | `apps/web/src/app/api/auth/[...path]/route.ts` |
| Client-only transports | `apps/web/src/lib/api.ts`, `apps/mobile/lib/core/networking/api_client.dart` |
| API-owned password verification | `services/api/src/auth/passwords.ts`, `services/api/src/auth/credentials.ts` |
| PKCE verifier stays on the API | `db/migrations/013_auth_oauth_states.sql`, `services/api/src/auth/providers/neon-oauth.ts` |
| Redirect allowlist | `services/api/src/config.ts` → `AUTH_OAUTH_REDIRECT_ALLOWLIST` |
| One token path | `services/api/src/auth/resolve-identity.ts` |
| Canonical status machine | `packages/contracts/src/index.ts` |
| Duplicated Dart state machine | `apps/mobile/lib/features/applications/domain/job_application.dart` |
| Client-fabricated application state | `apps/mobile/lib/features/applications/data/application_repository.dart` |
| Server transition enforcement | `services/api/src/services/applications.ts` |
| Server-side storage signing | `services/api/src/services/storage.ts` |
| The boundary gate | `scripts/check-boundaries.mjs`, `.github/workflows/ci.yml` |
| Auth end-to-end proof | `services/api/scripts/verify-auth.mjs` — 25 checks, green against production |
| Auth mounted ahead of identity | `services/api/src/app.ts` — `/v1/auth` is mounted before `identity`; the auth router resolves the caller itself in `services/api/src/routes/auth.ts` |
| Production token-signing guard | `services/api/src/auth/tokens.ts` → `accessSecret()` |
| Redis job durability | `services/api/src/db/redis-policy.ts`, called from `services/api/src/index.ts`. Reports the policy at boot; Upstash exposes no `CONFIG` for it, so the value itself is an operator setting |
