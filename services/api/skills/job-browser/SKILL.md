---
name: job-browser
description: Drive the job seeker's own browser for pages that require clicks, typing, scrolling, screenshots, or an authenticated session — most importantly the application agent, which submits forms on the user's behalf. The API never runs a browser; the user's machine does, under their control.
license: Proprietary — Angisoft Technologies
metadata:
  namespace: angisoft
  domain: jobs
  engine: browser
inputs:
  - name: JOB_SEEKER_BROWSER
    description: The user's own browser session, injected by the client-side automation agent. No server-side browser is ever launched.
    required: true
---

# Job Browser

Use this when a page must be *acted on*, not just read.

## Why it runs on the user's browser

Our API runs on Fly.io with no browser and no paid browser service. A page
that needs a click, a form fill, a login, or a screenshot is therefore handled
in the job seeker's own browser, driven by the client automation agent:

- the user's real identity, cookies, and session are already there
- the employer sees a genuine applicant from their own country and network
- nothing about the user's credentials ever transits our servers
- no browser fleet to pay for, host, or keep warm

## Use This When

- a careers board renders its listings only after a click or a scroll
- the flow needs form filling, filters, faceted navigation, or pagination
- the page is behind a login the user already holds
- the **application agent** must submit an application on the user's behalf

## How it works

1. The API decides *what* to do and returns an instruction plan: navigate,
   wait-for-selector, fill, select, press, scroll, click, screenshot.
2. The client agent executes the plan in the user's browser, step by step,
   reporting each result back to `/v1/agent/browser/report`.
3. Every step captures a state snapshot — DOM text, links, and a rendered
   screenshot when asked — so the server can verify the outcome without
   seeing the browser itself.
4. The application agent always pauses for explicit user confirmation before
   a final submit.

## Actions

| Action | Purpose |
| --- | --- |
| `navigate` | open the target URL |
| `waitForSelector` | block until the board has hydrated |
| `scroll` | reveal infinite-scroll listings |
| `fill` | type into a form field |
| `select` | choose from a dropdown |
| `press` | send a key (Enter, Tab) |
| `click` | press a button or a pagination control |
| `screenshot` | capture the current view as evidence |

## Rules

- Never automate a login the user has not explicitly authorised for that run.
- Never submit an application without a confirmation step.
- Never exfiltrate cookies, tokens, or form contents into the index — they are
  returned to the user and discarded.
- If a page can be read with **job-scrape**, stay on **job-scrape**.
