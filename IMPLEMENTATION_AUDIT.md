# Job Radar Implementation & UX Audit

**Audit scope:** 570 files across apps, services, packages, database, and docs were inventoried on 2026-10-27; review focused on executable source/config/contract paths, including 31 Next page files, 19 Express route modules, and 71 Dart files. “Implemented” means there is an executable path in this checkout; a schema, UI mock, contract, or future design alone does not qualify. This is a source review, not a production telemetry audit.

## Executive Assessment

The backend is the broadest layer, but it is not a complete implementation of every product promise in `docs/jobfinder.md`. The web client covers most candidate and operator workflows; Flutter covers a narrower candidate subset and has offline storage/sync. The initial review found endpoint and contract drift, now corrected for the reviewed workflows. Broader product coverage and visual differences remain. The architecture is a Node/TypeScript Express service plus a worker, not a deployed microservice fleet.

## Required Features vs. Current State

| Product capability described in docs | Current evidence | Status |
|---|---|---|
| Candidate identity, profile, skills, preferences, RBAC | Neon Auth/JWT resolution, profile/preferences routes, roles and permission middleware | **Implemented core**; profile parsing/import and richer career history are limited |
| Company registry and company intelligence | Company query/detail endpoints and web listing/detail | **Partial**; no broad company discovery/verification, enrichment, or intelligence timeline |
| Source catalog, job ingestion and normalization | Kenya and global connectors, RSS/ATS/HTML parsing, scheduled ingestion pipeline, source curator API | **Partial**; coverage, reliability, and monitoring are much smaller than the docs’ global target |
| Deduplication, freshness and fraud controls | Pipeline has deterministic keys and risk assessment; review queue and scam corpus/admin routes exist | **Partial**; documented MinHash/LSH clustering and calibrated model are proposals, not present |
| Job search, filters and role detail | REST search, Postgres FTS, optional semantic retrieval, web and mobile opportunity screens | **Implemented core**; pagination and consistent filter coverage need work; web filter state now syncs to the URL |
| Profile-to-job matching and explanations | Rule-based scoring, optional embeddings, `/matches` and per-job match endpoint, web/mobile match components | **Partial**; proposed bitmap/IDF engine is not implemented; “semantic + rules” UI may imply more than score service guarantees |
| Application tracking and workspace | Status state machine, event history, analysis/workspace APIs, guided web/mobile application flows | **Partial**; email preparation, embedded employer forms, saved checklists, and user-confirmed submission tracking are implemented. Job Radar does not submit forms or email on the user’s behalf |
| Resume/CV and cover-letter generation, ATS checks, exports | Web section editor with reordering, preview/autosave, ATS report, three PDF styles; four tracked AI agents analyze job criteria, map candidate evidence, draft a job-specific version, and review factual grounding. User reviews/edits proposal and saves an independent copy linked to target job. Exports omit platform attribution | **Partial**; no PDF/DOCX resume import/parsing, structured experience-entry editor, full template gallery/font/page controls, or side-by-side version history. Grounding review is best-effort; generic profile-based generation still asks users to supply missing work history |
| User-controlled application assistance and ATS platform adapters | Best-effort page analysis, email draft and document checklist, embedded employer pages, mobile live field/question reading, saved manual steps, final user confirmation | **Partial**; visible fields can be re-read locally in the mobile WebView. Provider-specific adapters, automatic field entry, and reliable cross-step page analysis are not implemented |
| Follow-ups and notifications | Follow-up CRUD, notification stream/realtime events and web/mobile alerts | **Partial**; channels are reminders, not confirmed outbound email/WhatsApp/LinkedIn delivery |
| Career insights and analytics | Admin stats, profile analysis, career intelligence mobile feature module | **Partial**; no demonstrated complete analytics projections or durable event replay |
| Integrations and account connections | Connections API and web page; OAuth start/callback routes | **Partial**; provider coverage and end-to-end lifecycle need verification |
| Mobile offline mode | SQLite cache, outbox, connectivity status and sync engine | **Partial**; reviewed paths and local-to-server ID remapping are implemented. Conflict/retry/idempotency behavior still needs a contract and device-level validation |
| Admin, moderation, support, source curation, automation | Role-aware web pages and corresponding API routes for some domains | **Partial**; several pages use API data shapes not clearly backed by dedicated domain APIs and need end-to-end role verification |
| Public marketing, legal and help content | Next pages exist; `/content/*` API routes provide copy, FAQ, pricing, legal, download and empty stories data | **Partial**; stories are intentionally empty until real testimonials are available |
| Multi-provider AI, agents and MCP | AI service routes, provider client, task tracking, embeddings, GraphQL, MCP endpoint | **Partial**; provider coverage, fallbacks, and user-visible guarantees are limited |
| Large-scale global system (10M+ users, Kafka, Kubernetes, etc.) | Future architecture and algorithm docs only | **Not implemented**; these are design targets, not deployable current components |

## Application and Page Coverage

**Web public routes:** `/`, `/about`, `/features`, `/stories`, `/pricing`, `/faq`, `/security`, `/privacy`, `/terms`, `/contact`, `/download`, `/login` (and auth callback). Public content requests now have matching Express routes; contact posts to the configured API origin.

**Web signed-in routes:** `/dashboard`, `/opportunities` and detail, `/matches`, `/applications` and detail, `/documents` and detail, `/followups`, `/profile`, `/connections`, `/settings`, `/companies` and detail, `/sources`, `/moderation`, `/support`, `/automation`, `/admin`. Job details now create/reuse an application and open a method-specific guided workspace. Company detail delegates to the listing module, and several operator views need contract/role verification. There are five user-selectable shell themes (Aurora, Editorial, Terminal, Kinetic, Atlas), while the public site and Flutter app use different visual systems.

**Flutter routes:** onboarding; opportunities and detail; applications and workspace; guided application browser/email flow; matches; notifications; profile (including documents); preferences; settings. Feature modules also include company intelligence, career intelligence, and follow-ups, but these are not top-level screens. Mobile has no dashboard, connections, source/admin/operator workflows, or public content routes.

## API and Infrastructure Reality

| Technology | Current use | Assessment |
|---|---|---|
| REST / Express | Primary web and mobile API under `/v1` plus legacy `/api/v1` alias | Keep this the canonical client contract |
| GraphQL | Yoga schema at `/graphql` and `/v1/graphql`; resolvers expose profiles, jobs, matches, applications, documents, companies, etc. | Operational but not visibly used by either UI; keep only for aggregate client queries/tools that benefit from it |
| gRPC | Separate Node server and protobuf contract; Fly config/process wiring exists | Server-to-server path, not used by browser/mobile; verify Fly process and health before treating production availability as proven |
| SOAP | No SOAP client, WSDL, or SOAP connector found | Not needed unless a real job source/provider requires it; add an adapter at that boundary only |
| Redis + BullMQ | Redis cache/rate limit/realtime dependencies; BullMQ queues and worker in API service | Present; worker queues/jobs and failure/retry behavior need operational monitoring |
| Postgres / Neon | Primary persistence, migrations, full-text and pgvector support | Current source of truth; proposals such as advanced indexes are not all used |
| Object storage | S3-compatible presigned upload/export integration | Configurable, but deployment provider/bucket availability is environment-dependent |
| CDN | Netlify hosts the Next deployment and static assets; no explicit separate CDN config/provider found | Use the hosting CDN for public photos/static assets; do not add another CDN until cache rules and media ownership are clear |
| SSE / WebSocket | Notification stream route and WebSocket hub in API | Present; verify reconnect/auth behavior across web and mobile |
| MCP | MCP JSON-RPC endpoint is mounted | Present; treat as an integration surface, not the main app API |

Do not “combine” all protocols into every request. Use REST for current first-party clients; GraphQL for screens needing a joined read model; gRPC only for stable internal service-to-service calls; SOAP only behind a connector for an upstream that requires it. Redis/BullMQ handle ephemeral cache and asynchronous work; Postgres remains authoritative.

## Sync Defects Addressed

- Flutter application, profile, document-generation, document-fetch, and follow-up requests now use the Express routes and methods reviewed in this audit.
- Mobile no longer retries every 404 against the legacy `/api/v1` prefix, and offline follow-up/application references are remapped after server-side creation.
- Web application status changes include the optimistic-lock `version`; web status choices and API transitions share the contracts package.
- OpenAPI now documents the reviewed endpoints and public `/content/*` behavior. It remains hand-maintained; operation-by-operation response schema validation is still needed before treating it as fully authoritative.
- Public contact uses the configured API origin; marketing content routes are mounted in Express.
- Notification SSE events are scoped to the authenticated user and owned application/follow-up aggregates.

## UI/UX Review and Redesign Direction

The public landing page has already been rebuilt around a clear three-step story, real career photography, a visible resume workspace preview, and diverse African professional imagery. The signed-in opportunity → guided application journey now includes a method-specific checklist, email preparation, an embedded employer page where allowed, and a user-confirmed submission step. Continue by making progress synchronization and saved answers consistent across devices, add provider adapters when there is real demand, and bring remaining workflows onto one shared design system. Keep photos for human storytelling; use functional interface previews for software capabilities.

### Interface guideline findings

- `apps/web/src/app/(app)/opportunities/page.tsx` now keeps URL query parameters in sync with filter changes.
- `apps/web/src/app/(app)/opportunities/page.tsx:112` removed the search input’s focus outline with no replacement; a visible `:focus-visible` ring is now applied.
- `apps/web/src/app/(app)/matches/page.tsx:27` previously promised “semantic relevance” unconditionally; copy now describes the actual profile factors without promising a provider state.
- `apps/web/src/components/shell.tsx` now gives the mobile menu dialog semantics, Escape handling, and focus management; the root layout provides a skip link and each app shell has a main landmark.
- Flutter now has a dedicated Matches navigation destination and moves document access under Profile.
- Contact form fields have labels and autocomplete; marketing imagery uses descriptive alt text. CSS avoids `transition: all` and respects reduced-motion preferences. A route-by-route accessibility pass is still needed.

Reference inspiration (interaction patterns only; the interface should remain original): [Career Connect job-search UX](https://www.behance.net/gallery/196808243/Career-Connect-Job-Search-Platform-UXUI), [Hirable AI job-search flow](https://www.behance.net/gallery/231298175/Hirable-AI-powered-Job-Search-Web-App), and [application dashboard status clarity](https://www.behance.net/gallery/241555715/Job-Application-Dashboard-Job-Board-Hiring-Platform). The useful patterns are explainable fit, an obvious saved/applied state, and one coherent application pipeline—not copying their visual assets or layouts.

## Recommended Order

1. Generate or validate client types from OpenAPI and add operation-level request/response checks to prevent future drift.
2. Define durable offline conflict, retry, and idempotency behavior, then validate sync on-device.
3. Complete mobile’s secondary workflows (dashboard, connections, preferences coverage) and bring remaining screens onto the shared design system.
4. Validate the guided application journey with real employer pages and improve dynamic page analysis without taking over form submission.
5. Apply the design system to remaining candidate and operator pages.
6. Verify deployed worker/gRPC/realtime/storage/CDN configuration in Fly/Netlify and document actual production topology separately from product proposals.

## Source Map Reviewed

`docs/jobfinder.md`, `docs/ALGORITHMS.md`; root workspace and deployment configuration; `services/api/src` routes, services, workers, GraphQL, gRPC and realtime; `packages/contracts`; `db/migrations` and seeds; all Next app routes and marketing components; Flutter routing, feature modules, networking, persistence, sync and theme. Existing local changes were preserved.

## Validation Notes

- API and web TypeScript checks pass: `npm run typecheck -w @angisoft/job-radar-api` and `npm run typecheck -w @angisoft/job-radar-web`.
- Web production build passes: `npm run build -w @angisoft/job-radar-web`.
- Targeted Dart analysis passed for the guided application screen and router. Full Flutter analysis stalled without finishing. Android debug build was interrupted after 504 seconds with no build result.
- No test suites were run.
