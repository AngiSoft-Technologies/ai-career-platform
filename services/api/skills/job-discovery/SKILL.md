---
name: job-discovery
description: Route a job-discovery task to the narrowest capability that fits — search, scrape, extract, or browser — and pick the next step when one is not enough. Use whenever an agent must go from "we need jobs" to "we have verified vacancies" across the whole pipeline.
license: Proprietary — Angisoft Technologies
metadata:
  namespace: angisoft
  domain: jobs
  engine: orchestration
inputs: []
---

# Job Discovery

This is the entry point. Every other job skill is reachable from here.

## The pipeline

```
search  ──►  scrape  ──►  extract  ──►  verify  ──►  promote
 (URLs)      (pages)      (records)     (dedupe)     (live catalogue)
```

## Routing rules

- No URLs yet → **job-search**
- URLs exist, content needed → **job-scrape**
- Content exists, record needed → **job-extract**
- Page needs clicking, typing, logging in, or a screenshot → **job-browser**
- A URL points at a known ATS → expansion agent (whole board, not one listing)
- A source keeps returning the same listings → freshness engine backs it off

## Survivability

The pipeline has three independent discovery routes so that a failure in one
does not stop the product:

1. **Direct feeds** — key-less public job APIs. Guaranteed volume.
2. **Search engines** — our own clients over our own egress. Reach.
3. **ATS expansion + careers crawling** — breadth once a single URL is known.

If all three are blocked on a given cycle, the run reports partial rather than
failed, and the frontier re-queues the work with backoff instead of dropping it.

## Priority order

Kenya first — onsite, hybrid, and remote alike — then the rest of Africa, then
remote roles worldwide that African nationals can hold. Eligibility is
recorded on every record, never filtered silently, so the UI can explain why
a job is or is not a fit.
