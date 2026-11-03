---
name: job-discovery-search
description: Integrate web search into the ai-career-platform application whenever a product or agent needs to discover job-related pages from a query — search the web and optionally hydrate result content. Use when an app needs discovery before extraction, when the feature starts with a query instead of a URL, or when the system should search the web and optionally hydrate result content.
license: ISC
metadata:
  author: ai-career-platform
  version: "0.1.0"
  homepage: https://github.com/Angera-Silas/ai-career-platform
  source: https://github.com/Angera-Silas/ai-career-platform
inputs:
  - name: ANGISOFT_API_KEY
    description: angisoft API key for hosted angisoft requests.
    required: true
  - name: ANGISOFT_API_URL
    description: Optional base URL for self-hosted angisoft deployments.
    required: false
---

# Job Discovery Search

Use this when the application starts with a query, not a URL, for job discovery.

## Use This When

- the user asks a question and the product must discover job sources first
- the feature needs current web job results
- you want to turn a search query into a shortlist of pages for later scraping or extraction

## Default Recommendations

- Use `/job-search` first when URL discovery is part of the product behavior
- Keep search and extraction conceptually separate unless scraping search results is clearly required for jobs
- Prefer selective follow-up extraction over broad hydration when cost or latency matters for job data

## Common Product Patterns

- answer generation with cited job sources
- company, competitor, or topic job discovery
- research workflows that produce a shortlist of **web pages** before deeper job extraction
- query-to-URL pipelines for later `/job-scrape` or `/job-interact`

Note that "research workflow" here means discovering web pages. If the product is
searching **published papers**, that is a different surface — see the escalation
rules below.

## Escalation Rules

- If you already have the URL, use [job-discovery-scrape](../job-discovery-scrape/SKILL.md).
- If the result page then requires scraping for job content, use [job-discovery-build](../job-discovery-build/SKILL.md).

## Boundary With The CLI

Both this repo and the CLI skills are installed by the same command:

```bash
npx -y angisoft-cli@latest init --all --browser
```

Use these build skills for application integration. Use the CLI skills
for live web work during the current session (one-off research, terminal
workflows, editor setup). Both are available after install.