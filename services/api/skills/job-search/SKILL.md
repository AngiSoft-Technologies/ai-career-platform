---
name: job-search
description: Find job listings from the open web using our own search engines. Use when an agent has no URLs yet and must discover employers, careers pages, ATS boards, and vacancies from scratch. No vendor search API and no vendor API key is involved — this skill runs our own DuckDuckGo/SearXNG/Bing clients over our own egress pool.
license: Proprietary — Angisoft Technologies
metadata:
  namespace: angisoft
  domain: jobs
  engine: search
inputs: []
---

# Job Search

Use this when the pipeline starts empty: the agent has a role, a skill, or a
country and must find who is hiring.

## Use This When

- a new employer enters the system with no known careers URL
- a user asks for something we have never indexed
- a region, profession, or work mode has thin coverage
- the direct feeds returned nothing new this cycle

## How it works

1. **Seed queries** are generated from live demand — user desired roles,
   candidate skills, preferred countries — plus exploration queries that force
   brand-new domains to surface.
2. **Engines** are tried in order: SearXNG (multi-instance JSON), DuckDuckGo
   HTML (pagination + anti-bot retry), then Bing HTML as a last resort. All
   requests go through our own egress pool with rotating browser fingerprints.
3. **Results** are normalised to `{ url, title, description, engine }`, deduped
   by URL, and written to `discovery_search_results` for the browse agent.

## Rules

- Prefer depth over breadth: `site:example.com jobs` on a domain that has
  already produced a job beats a generic query that returns noise.
- Always record the engine that produced a result. The learning agent uses
  this to deprioritise engines that are blocked on our egress IPs.
- A search that returns zero results is a *signal*, not a failure — record it
  so the frontier does not immediately retry the same query.

## Escalation

- Once URLs exist, hand off to **job-scrape** to read the pages.
- When a result points at a known ATS (Greenhouse, Lever, Ashby, Workable,
  SmartRecruiters, Recruitee, Workday, Oracle HCM), hand off to the expansion
  agent, which pulls the employer's entire board instead of one listing.
