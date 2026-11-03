---
name: job-scrape
description: Read a job or careers page with our own fetch engine — SSRF guard, charset detection, robots.txt, politeness, caching, PDF support — and recover listings from JavaScript-rendered pages without a browser.
license: Proprietary — Angisoft Technologies
metadata:
  namespace: angisoft
  domain: jobs
  engine: scrape
inputs: []
---

# Job Scrape

Use this when the agent already has a URL and needs the page content.

## Use This When

- the search agent returned candidate URLs
- a careers page must be read to find its job links
- a specific vacancy must be read for its description, salary, and deadline

## How it works

1. **Fetch** through `engine/fetch.ts`: rejects private-network targets (SSRF
   guard), reads `robots.txt` per host with a cached parser, enforces a
   per-host crawl delay, detects charset from both the header and
   `<meta charset>`, and caches the parsed result.
2. **PDFs** are parsed directly — many African employers and UN agencies post
   vacancy adverts as PDF.
3. **JavaScript pages** are recovered without a browser by
   `engine/screen.ts`: it reads `__NEXT_DATA__`, `__NUXT__`, `__INITIAL_STATE__`,
   `__APOLLO_STATE__`, `__remixContext`, and inline JSON, walks those objects
   for job-shaped records, and scans inline scripts for the board's own API
   endpoints so pagination can call them directly.
4. **Crawling** uses `engine/crawl.ts`: a bounded frontier with path-depth
   limits, include/exclude patterns, scope checks, and job-biased link
   ranking so shallow crawls find vacancies before blog posts.

## Rules

- A page that renders "no jobs found" without JavaScript is not empty — try
  the screen engine before concluding the employer has no vacancies.
- Never follow a link off the employer's own domain unless the expansion
  agent confirmed it is an ATS board.
- Respect robots.txt. A blocked host is recorded as a negative result so we
  do not re-ask on the next cycle.

## Index reuse

Repeat reads of the same URL reuse the indexed copy unless the read exists
to detect *new* jobs, in which case the index is bypassed and the page is
re-fetched.

## Escalation

- Content is extracted by **job-extract**.
- Pages that genuinely require clicks, typing, or an authenticated session
  are handed to **job-browser**, which runs in the job seeker's own browser.
