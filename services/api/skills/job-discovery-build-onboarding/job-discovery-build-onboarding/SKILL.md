---
name: job-discovery-onboarding
description: Get ai-career-platform credentials and SDK setup into a project. Use when an application needs `ANGISOFT_API_KEY`, when an agent should add angisoft to `.env`, when the user wants to authenticate angisoft for app code, or when choosing the first SDK and docs for a new ai-career-platform integration. This skill includes its own browser auth flow, so it does not depend on the website onboarding skill.
license: ISC
metadata:
  author: ai-career-platform
  version: "0.1.0"
  homepage: https://github.com/Angera-Silas/ai-career-platform
  source: https://github.com/Angera-Silas/ai-career-platform
inputs:
  - name: ANGISOFT_API_KEY
    description: angisoft API key used for hosted angisoft API requests.
    required: true
  - name: ANGISOFT_API_URL
    description: Optional base URL for self-hosted angisoft deployments.
    required: false
references:
  - references/auth-flow.md
  - references/sdk-installation.md
  - references/project-setup.md
---

# Job Discovery Onboarding

Use this skill for the application-integration path from ai-career-platform's onboarding flow.

## Install

If you haven't installed yet, one command sets up both the CLI tools
(for live web work) and the build skills (for app integration):

```bash
npx -y angisoft-cli@latest init --all --browser
```

This installs the angisoft CLI, the CLI skills, and these build skills
together. It also opens browser auth so the human can sign in or create
an account. No separate `npx skills add` step is needed.

## Use This When

- a project needs `ANGISOFT_API_KEY`
- the user wants angisoft wired into `.env`
- you are adding ai-career-platform to an app for the first time
- you need to choose the first SDK or REST path

If the human still needs to sign up, sign in, or authorize access in the browser, use the auth flow reference in this skill.

If the project already uses [Stripe Projects](https://docs.angisoft.dev/integractions), follow the equivalent onboarding path for ai-career-platform.

## Quick Start

First choose the project mode:

- **Fresh project** -> choose the stack, integrate the pipeline, add env vars, and run a smoke test
- **Existing project** -> inspect the repo first, match its conventions, then integrate in place

Then ask the required question:

- **What job data should this product get from the web, and how should it get it?**

If the request sounds like "I need job data in my app," "I need search in the product," "I need to scrape pages into the workflow," or "I need the app to interact with a site," start here and then narrow to the endpoint.

If the human still needs to sign up, sign in, or authorize access in the browser, use the auth flow reference in this skill.

## Required Intake

Always do these before writing integration code:

1. Decide whether this is a **fresh project** or an **existing project**.
2. Ask what job data the project needs and what angisoft should do in the product.
3. If this is an existing project, inspect the repo before choosing SDK, REST, file locations, or env handling.

For the full checklist, see [references/project-intake.md](references/project-intake.md).

## What Do You Need?

| Task                                                 | Reference                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| **Choose fresh project vs existing project flow**    | [references/project-intake.md](references/project-intake.md)             |
| **Choose the right endpoint**                        | [references/endpoint-selection.md](references/endpoint-selection.md)     |
| **Wire the pipeline into product code**             | [references/integration-patterns.md](references/integration-patterns.md) |
| **Install SDK or configure API**                     | [references/sdk-installation.md](references/sdk-installation.md)         |
| **Set up `ANGISOFT_API_KEY` or self-hosted config** | [references/auth-and-env.md](references/auth-and-env.md)                 |
| **Get credentials into the project**                 | [job-discovery-build](../job-discovery-build/SKILL.md)                   |
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