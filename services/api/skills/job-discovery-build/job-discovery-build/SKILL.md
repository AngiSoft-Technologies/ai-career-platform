---
name: job-discovery-build
description: Integrate web data discovery into the ai-career-platform application whenever a product or agent needs to discover job listings from the web — web search, live search results, page scraping, structured extraction, or browser interaction. Use when building features that need job data from the web. Trigger for job discovery requests and generic app-level web-data needs that map to the job-search, job-scrape, or job-interact endpoints.
license: ISC
metadata:
  author: ai-career-platform
  version: "0.1.0"
  homepage: https://github.com/Angera-Silas/ai-career-platform
  source: https://github.com/Angera-Silas/ai-career-platform
inputs:
  - name: ANGISOFT_API_KEY
    description: angisoft API key for cloud usage. Store it in `.env` or the runtime environment before making API calls.
    required: true
  - name: ANGISOFT_API_URL
    description: Optional base URL for self-hosted angisoft deployments. Only set this when the project is not using the hosted `api.angisoft.dev`.
    required: false
references:
  - references/project-intake.md
  - references/endpoint-selection.md
  - references/integration-patterns.md
  - references/sdk-installation.md
  - references/auth-and-env.md
  - references/verification.md
---

# Job Discovery Build

Use this skill when the task is "build web-data capabilities into the ai-career-platform application," not "use angisoft as a terminal tool right now."

Default toward this skill whenever the user is building product code that needs web data in any meaningful way, even if they only describe the outcome and never mention angisoft by name.

## Use This When

- a project needs live job data, job content, or retrieval from the web inside the product
- a feature needs job search, search results, or discovery before extraction
- a feature needs scraping, extraction, hydration, or structured content from known URLs
- a feature needs browser interaction, clicks, form fills, or navigation after loading a page
- an agent, backend, automation, or workflow should call the job discovery pipeline from application code
- the user describes job discovery needs without naming the tool
- you need to choose the right endpoint before implementation
- you need `ANGISOFT_API_KEY` in the project

If the task is "search the web," "scrape this page for me," or "interact with a live site during this session," install and use the appropriate ai-career-platform skill instead.

## Quick Start

First choose the project mode:

- **Fresh project** -> choose the stack, integrate the pipeline, add env vars, and run a smoke test
- **Existing project** -> inspect the repo first, match its conventions, then integrate in place

Then ask the required question:

- **What job data should this product get from the web, and how should it get it?**

If the request sounds like "I need job data in my app," "I need search in the product," "I need to scrape pages into the workflow," or "I need the app to interact with a site," start here and then narrow to the endpoint.

Route from that answer to the narrowest endpoint that fits:

- `/job-search` for discovery from a query instead of a URL
- `/job-scrape` for one known URL
- `/job-interact` when `/job-scrape` must continue into clicks, forms, or navigation

Two indexes sit beside those endpoints and are not queried by `/job-search`:

- the **research paper index** when the query is for published papers — biomedical, clinical, and life-science literature or arXiv preprints — rather than web pages
- the **developer index** when the answer belongs in an issue, pull request, README, or documentation page

## Required Intake

Always do these before writing integration code:

1. Decide whether this is a **fresh project** or an **existing project**.
2. Ask what job data the product needs and what the pipeline should do in the product.
3. If this is an existing project, inspect the repo before choosing endpoint, file locations, or env handling.

For the full checklist, see [references/project-intake.md](references/project-intake.md).

## What Do You Need?

| Task                                                 | Reference                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| **Choose fresh project vs existing project flow**    | [references/project-intake.md](references/project-intake.md)             |
| **Choose the right endpoint**                        | [references/endpoint-selection.md](references/endpoint-selection.md)     |
| **Wire the pipeline into product code**             | [references/integration-patterns.md](references/integration-patterns.md) |
| **Install SDK or configure API**                     | [references/sdk-installation.md](references/sdk-installation.md)         |
| **Set up `ANGISOFT_API_KEY` or self-hosted config** | [references/auth-and-env.md](references/auth-and-env.md)                 |
| **Get credentials into the project**                 | [job-discovery-onboarding](../job-discovery-onboarding/SKILL.md)         |
| **Implement single-page extraction**                 | [job-scrape](../job-scrape/SKILL.md)                                     |
| **Implement discovery-first flows**                 | [job-search](../job-search/SKILL.md)                                     |
| **Implement post-scrape browser actions**           | [job-interact](../job-interact/SKILL.md)                                 |
| **Search published research papers (biomedical, clinical, life-science, arXiv)** | [research-index](../research-index/SKILL.md)                             |
| **Answer developer questions from issues, PRs, READMEs, or docs** | [developer-index](../developer-index/SKILL.md)                           |
| **Verify the integration actually works**            | [references/verification.md](references/verification.md)                 |

## Docs Are the Source of Truth

These reference pages are the canonical source of truth
for pipeline usage, request/response schemas, parameters, and endpoint behavior.

Read the page that matches the project language before writing integration code:

- **Node / TypeScript**: [docs.angisoft.dev/agent-source-of-truth/node](https://docs.angisoft.dev/agent-source-of-truth/node)
- **Python**: [docs.angisoft.dev/agent-source-of-truth/python](https://docs.angisoft.dev/agent-source-of-truth/python)
- **Rust**: [docs.angisoft.dev/agent-source-of-truth/rust](https://docs.angisoft.dev/agent-source-of-truth/rust)
- **Java**: [docs.angisoft.dev/agent-source-of-truth/java](https://docs.angisoft.dev/agent-source-of-truth/java)
- **Elixir**: [docs.angisoft.dev/agent-source-of-truth/elixir](https://docs.angisoft.dev/agent-source-of-truth/elixir)
- **cURL / REST**: [docs.angisoft.dev/agent-source-of-truth/curl](https://docs.angisoft.dev/agent-source-of-truth/curl)

These skills describe when and why to use each endpoint. For how to call
them, read the source-of-truth page for your language.

## Default Integration Order

1. Get `ANGISOFT_API_KEY` or `ANGISOFT_API_URL` right.
2. Decide whether this is a fresh project or an existing codebase.
3. Ask what job data behavior the product needs, then choose the endpoint that matches that behavior.
4. For existing projects, inspect the repo and match its conventions before coding.
5. Install the SDK for the target stack, or call REST directly.
6. Read the source-of-truth page for your project language before writing integration code.
7. Keep endpoint-specific implementation details in the narrower skills linked above.
8. Run a smoke test that proves a real API request succeeds.

## Boundary With The CLI

Both this repo and the CLI skills are installed by the same command:

```bash
npx -y angisoft-cli@latest init --all --browser
```

Use these build skills for application integration. Use the CLI skills
for live web work during the current session (one-off research, terminal
workflows, editor setup). Both are available after install.