# Browser runtime

A small, standalone Playwright service used by the stage 2 application workspace. It opens an employer page in an **isolated, in-memory browser**, streams JPEG frames over ordinary HTTP polling, exposes a redacted accessibility/DOM state, and accepts a narrow set of user-triggered commands.

The web app never talks to this service from the browser. `apps/web/src/app/api/browser-workspace/[...path]/route.ts` is the only caller, authenticates the signed-in user against the API, and injects the runtime secret server-side.

## What it is honest about

- **Remote browsers do not inherit the candidate's logins.** Every session starts with an empty context. If the employer site expects a signed-in account, switch the workspace to companion-tab mode and keep the guidance rail beside your own browser.
- **Arbitrary sites can block automation or embedding.** Many ATS vendors detect headless browsers, require WebAuthn, or refuse to render in a frame. The runtime reports those as blockers instead of pretending the page worked. The streamed frame is a screenshot, not a magic iframe that bypasses site policy.
- **Passwords, OTPs, MFA codes, card/CVV, SSN and legal-consent values are never read or filled.** Sensitive fields are marked `manualOnly`; their values are omitted from observations and the runtime refuses fill/select commands for them.
- **Nothing is submitted automatically.** `submit` is rejected unless the command literally contains `confirm: true`, which only the explicit confirmation dialog in the UI sends. Navigation, observations and hint acknowledgements never submit a form.
- **No cookies or credentials are written to disk.** The Playwright context is persistent only for the lifetime of one guidance session (so polls see the same page), then closed. There is no Chromium user-data directory carrying a profile between users.
- **Uploads are not arbitrary-URL fetches.** PDF URLs must either be on `UPLOAD_ALLOWED_HOSTS` or be an HMAC-signed `data:` URL minted by the authenticated web proxy. Redirects are re-validated, the payload must start with `%PDF`, and size is capped.

## Run

```bash
npm install --prefix services/browser-runtime
export BROWSER_RUNTIME_TOKEN='replace-with-a-long-random-value'
export BROWSER_UPLOAD_SECRET='replace-with-a-separate-long-random-value'
npm --prefix services/browser-runtime run dev
```

The web app also needs `BROWSER_RUNTIME_URL` (default `http://127.0.0.1:8787`), `BROWSER_RUNTIME_TOKEN` and `BROWSER_UPLOAD_SECRET` in its server environment. They must match the runtime values; never prefix them with `NEXT_PUBLIC_`.

Or with Docker Compose (the service is in an optional profile so existing deployments are unchanged):

```bash
docker compose --profile browser up browser-runtime
```

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `BROWSER_RUNTIME_TOKEN` | required | Bearer token for every runtime call. Server-side only. |
| `BROWSER_UPLOAD_SECRET` | falls back to the runtime token | HMAC secret for signed PDF data URLs. Set separately in production. |
| `UPLOAD_ALLOWED_HOSTS` | `cdn1.angisoft.co.ke` | Comma-separated hosts allowed for ordinary signed PDF URLs. A leading dot allows subdomains. |
| `FRAME_RATE_LIMIT_MS` | `700` | Minimum interval between frame polls per session. |
| `MAX_BROWSER_SESSIONS` | `4` | Concurrent contexts. Excess creates return 503. |
| `SESSION_IDLE_TTL_MS` | `1800000` | Idle contexts are closed after 30 minutes. |
| `UPLOAD_MAX_BYTES` | `12582912` | Maximum PDF size. |
| `ALLOW_PRIVATE_NAVIGATION` | `false` | Local development only; permits localhost/private-IP employer URLs. |
| `PORT` | `8787` | HTTP port. |

## Endpoints

All endpoints except `/health` require `Authorization: Bearer $BROWSER_RUNTIME_TOKEN`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Readiness plus current session count. |
| `POST` | `/sessions` | Body: `{ applicationId, guidanceSessionId, targetUrl, token }`. `token` is accepted for server-to-server callers; the proxy also sends the bearer header. The session id is the guidance session id. |
| `GET` | `/sessions/:id/frame` | Pollable `image/jpeg`. 429 with `Retry-After` when polled too quickly. |
| `GET` | `/sessions/:id/state` | `{ url, title, fields, visibleText, blockers }`. Sensitive values are redacted. |
| `POST` | `/sessions/:id/command` | Commands below. |
| `DELETE` | `/sessions/:id` | Closes the context and discards all in-memory state. |

### Commands

- `navigate { url }` — public HTTP(S) page only.
- `click { selector }` — simple CSS selector; XPath/text engines and JavaScript are rejected.
- `fill { key, value }` — targets the field key from the latest state; sensitive/manual fields are refused.
- `select { key, value }` — dropdowns by value or label.
- `upload { key, url, filename? }` — PDF file input from an allowlisted or signed URL.
- `submit { confirm: true, selector? }` — the only way to click a submit control.

## Why signed data URLs for PDFs

The API exports approved documents as authenticated bytes; it does not yet publish signed object URLs. The web proxy therefore fetches the PDF as the signed-in user, base64-encodes it, and signs `documentId.expiry.payload` with `BROWSER_UPLOAD_SECRET`. The runtime verifies HMAC, expiry, size and the PDF magic bytes before handing a buffer to Playwright. This keeps the URL capability-shaped without putting a user token in a query string. For large PDFs an API-issued object-store URL on `UPLOAD_ALLOWED_HOSTS` is preferable; the runtime already supports that path.
