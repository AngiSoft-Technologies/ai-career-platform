---
name: job-discovery-interact
description: Integrate web interaction into the ai-career-platform application whenever a product or agent needs to perform dynamic actions on web pages — clicks, form fills, pagination, authentication-aware flows, or other multi-step interactions that plain `/job-scrape` cannot complete. Use when a feature needs to interact with a site for job data.
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

# Job Discovery Interact

Use this when `/job-scrape` is not enough because the feature needs to act on the page for job data.

## Use This When

- content appears only after clicks, typing, or navigation for job data
- the feature needs forms, pagination, filters, or multi-step flows for job listings
- the product must stay in the same browser context after scraping for job data

## Default Recommendations

- Start with `/job-scrape`, then escalate to `/job-interact`
- Keep `/job-interact` scoped to the smallest browser workflow that unlocks job data
- Use persistent profiles only when the feature truly needs authenticated state across sessions for job data

## Common Product Patterns

- search forms and faceted filters for jobs
- paginated job result sets
- login-gated dashboards or tools for job access
- flows where the page must be explored before job extraction is complete

## Implementation Notes

- `/job-interact` is the right tool when the page must be manipulated, not just read for job data
- Keep prompts or action code specific to the job discovery product flow
- If the use case is fully open-ended browser automation for jobs, evaluate whether a browser sandbox is a better product fit

## Escalation Rules

- If the page can be read directly, stay on [job-discovery-build](../job-discovery-build/SKILL.md).
- If the page can be scraped directly, stay on [job-discovery-scrape](../job-discovery-scrape/SKILL.md).
- If the page then requires clicks, typing, pagination, or navigation, use [job-discovery-interact](../job-discovery-interact/SKILL.md).

## Boundary With The CLI

Both this repo and the CLI skills are installed by the same command:

```bash
npx -y angisoft-cli@latest init --all --browser
```

Use these build skills for application integration. Use the CLI skills
for live web work during the current session (one-off research, terminal
workflows, editor setup). Both are available after install.