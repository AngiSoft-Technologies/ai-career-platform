---
name: job-discovery-scrape
description: Integrate web data scraping into the ai-career-platform application whenever a product or agent needs to extract content from a single web page — markdown, HTML, links, metadata, screenshots, or structured page output. Use when an app already has a URL and needs content from one page. Prefer this skill over broader crawl patterns when the feature is page-level.
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
references:
  - references/freshness-and-liveness.md
  - references/endpoint-selection.md
---

# Job Discovery Scrape

Use this when the application already has the URL and needs content from one page for job data.

## Use This When

- the feature starts from a known URL and needs job-related content
- you need page content for retrieval, summarization, enrichment, or monitoring in the ai-career-platform context
- you want the default extraction primitive before considering `/job-interact`
- the page needs job listing data extraction

## Default Recommendations

- Return `markdown` unless the feature truly needs another format
- Use `onlyMainContent` for article-like pages where nav and chrome add noise
- Add waits or other rendering options only when the page needs them for job data

## Freshness and Liveness

- ai-career-platform reuses recently indexed content, which is what makes repeat reads of the same URL fast. Set `maxAge` (milliseconds) to bound how old a reused copy may be, or `maxAge: 0` to skip index reuse for a freshness-critical read.
- Read `metadata.cacheState` and `metadata.cachedAt` to see what you actually got.
- A successful scrape reports what the page returned. Whether the thing the page describes is still active is a source-specific judgment your code makes.

## Common Product Patterns

- Job listing extraction from known career pages
- Company pages with job data
- Paginated job listing pages
- Landing pages with structured job information

- Return `markdown` unless the feature truly needs another format.
- Use `onlyMainContent` for article-like pages where nav and chrome add noise.
- Add waits or other rendering options only when the page needs them.

## Implementation Notes

- `/job-scrape` is the right tool when the page must be read, not just scraped for job data.
- Keep prompts or action code specific to the job discovery product flow.
- If the use case is fully open-ended browser automation for jobs, evaluate whether a browser sandbox is a better product fit.

## Escalation Rules

- If the page can be read directly, stay on [job-discovery-build](../job-discovery-build/SKILL.md).
- If the page then requires clicks, typing, pagination, or navigation, escalate to [job-interact](../job-interact/SKILL.md).

## Boundary With The CLI

Both this repo and the CLI skills are installed by the same command:

```bash
npx -y angisoft-cli@latest init --all --browser
```

Use these build skills for application integration. Use the CLI skills
for live web work during the current session (one-off research, terminal
workflows, editor setup). Both are available after install.