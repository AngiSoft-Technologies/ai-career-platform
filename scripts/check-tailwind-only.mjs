#!/usr/bin/env node
/**
 * Tailwind-only styling gate.
 *
 * The web app has one global stylesheet: Tailwind's entry point plus the
 * runtime theme tokens it needs. Pages and UI components must express their
 * styling with Tailwind utilities. This check prevents the old page-specific
 * CSS layers, semantic CSS classes, and static inline styles from returning.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const webRoot = join(repoRoot, "apps/web");
const sourceRoot = join(webRoot, "src");
const allowedCssFiles = new Set([join(sourceRoot, "app/globals.css")]);

const violations = [];

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }

  return files;
}

const sourceFiles = walk(sourceRoot);

for (const file of sourceFiles) {
  if (!/\.(css|scss|sass|less)$/.test(file)) continue;
  if (!allowedCssFiles.has(file)) {
    violations.push({
      file: relative(repoRoot, file),
      rule: "stylesheet outside the Tailwind entry point",
      text: "Only apps/web/src/app/globals.css is allowed.",
    });
  }
}

const legacyClasses = [
  "surface",
  "surface-solid",
  "surface-hover",
  "glass",
  "neu",
  "neu-inset",
  "btn",
  "btn-primary",
  "btn-accent",
  "btn-outline",
  "btn-ghost",
  "btn-danger",
  "btn-sm",
  "btn-lg",
  "btn-icon",
  "field",
  "label",
  "textarea",
  "select",
  "switch",
  "badge",
  "badge-neutral",
  "badge-accent",
  "badge-success",
  "badge-warning",
  "badge-danger",
  "badge-info",
  "chip",
  "display",
  "eyebrow",
  "mono",
  "tabular",
  "bento",
  "stack",
  "row",
  "row-wrap",
  "spacer",
  "grid-2",
  "grid-3",
  "grid-4",
  "grid-rail",
  "grid-rail--flip",
  "grid-rail--aside",
  "app-grid",
  "main-pad",
  "data-table",
  "table-scroll",
  "meter",
  "editor-pane",
  "editor-block",
  "editor-block-head",
  "editor-block-body",
  "drag-handle",
  "paper",
  "divider",
  "kbd",
  "skeleton",
  "animate-in",
  "opportunity-search",
  "skip-link",
  "live-dot",
  "marquee",
  "marquee-track",
  "scroll-x",
  "aurora-grid",
];

const escapedLegacy = legacyClasses.map((name) =>
  name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
);
const legacyPattern = new RegExp(
  "(?:^|[\\s\"'`])" +
    `(?:${escapedLegacy.join("|")}|mk-[A-Za-z0-9_-]+|jr-[A-Za-z0-9_-]+|application-guide(?:__[A-Za-z0-9_-]+)?|aurora-[A-Za-z0-9_-]+|landing(?:-[A-Za-z0-9_-]+)?)` +
    "(?=$|[\\s\"'`])",
  "gm",
);

const staticStylePattern = /style\s*=\s*\{\{([\s\S]*?)\}\}/g;
const staticPropertyPattern =
  /(?:^|[,{]\s*)([A-Za-z-]+)\s*:\s*(?:"[^"\n]*"|'[^'\n]*'|\d+(?:\.\d+)?|true|false)\s*(?=[,}])/g;

for (const file of sourceFiles) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    legacyPattern.lastIndex = 0;
    let match;
    while ((match = legacyPattern.exec(line)) !== null) {
      violations.push({
        file: relative(repoRoot, file),
        line: index + 1,
        rule: "legacy CSS class",
        text: match[0].trim(),
      });
    }
  });

  staticStylePattern.lastIndex = 0;
  let styleMatch;
  while ((styleMatch = staticStylePattern.exec(source)) !== null) {
    const before = source.slice(0, styleMatch.index);
    const line = before.split("\n").length;
    const properties = styleMatch[1].match(staticPropertyPattern) ?? [];
    for (const property of properties) {
      violations.push({
        file: relative(repoRoot, file),
        line,
        rule: "static inline style",
        text: property.trim(),
      });
    }
  }
}

const globalsPath = join(sourceRoot, "app/globals.css");
const globals = readFileSync(globalsPath, "utf8");
if (!/@import\s+["']tailwindcss["'];/.test(globals)) {
  violations.push({
    file: relative(repoRoot, globalsPath),
    rule: "Tailwind entry point missing",
    text: 'Expected @import "tailwindcss";',
  });
}

if (violations.length > 0) {
  console.error("Tailwind-only violations found:\n");
  for (const violation of violations) {
    const location = violation.line
      ? `${violation.file}:${violation.line}`
      : violation.file;
    console.error(`  ${location}  ${violation.rule}\n    ${violation.text}`);
  }
  console.error(
    "\nUse Tailwind utilities in JSX. Keep globals.css for Tailwind and runtime theme tokens only.",
  );
  process.exit(1);
}

console.log(
  "Tailwind-only check passed: one global entry point, no legacy classes, and no static inline styles.",
);
