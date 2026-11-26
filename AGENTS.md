# Project rules

## Absolute design rules

- **NEVER use squared lines / grid / graph-paper backgrounds in any code** — web, mobile, docs, emails, or generated assets. This includes CSS `linear-gradient(... 1px, transparent 1px)` grids, `repeating-linear-gradient` line textures, dotted grids (`radial-gradient(circle at 1px 1px, ...)`), and any similar "squared lines" pattern. Use solid theme surfaces or intentional imagery/video instead. The user hates these to death — do not reintroduce them in any form.

## Web

- **ALWAYS load and follow `modern-web-guidance` and `frontend-design` before coding or redesigning any web page/UI.** Do not write web UI from memory; use current skill guidance.
- See `apps/web/AGENTS.md` for the Next.js version-specific rules. Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing Next.js code.
