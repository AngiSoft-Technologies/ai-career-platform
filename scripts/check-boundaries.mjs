#!/usr/bin/env node
/**
 * Boundary gate.
 *
 * The API is the only party that talks to the identity provider, the database
 * or any other backend service. The web and mobile apps may only talk to the
 * API.
 *
 * This script fails the build when a client reaches outside that boundary.
 * It is deliberately a grep and not a linter: the rules are simple enough to
 * read in one sitting and the failure message has to point at the exact line.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;

/** Directories that make up the client applications. */
const CLIENT_ROOTS = ["apps/web/src", "apps/mobile/lib"];

/**
 * Patterns that must not appear in client code.
 *
 * Each entry is a name and a regular expression. The expression is matched
 * against every line of every client source file.
 */
const FORBIDDEN = [
  {
    name: "identity provider host",
    pattern: /neonauth\.|neon\.tech\/neondb|auth\.myneon\.app/i,
  },
  {
    name: "identity provider client SDK",
    pattern: /@neondatabase\/auth|neon_auth\.session_verifier/i,
  },
  {
    name: "identity provider environment variable",
    pattern: /NEON_AUTH_(URL|BASE_URL|JWKS_URL|OAUTH_CLIENT_SECRET)/,
  },
  {
    name: "direct provider sign-in SDK",
    pattern: /google_sign_in|GoogleSignIn\.|supabase\.|@clerk\/|firebase\/auth/,
  },
  {
    name: "direct database access",
    pattern: /from ['"]pg['"]|require\(['"]pg['"]\)|postgres(ql)?:\/\//i,
  },
];

/** Hostnames a client is allowed to address. */
const ALLOWED_CLIENT_HOSTS = [
  /job-radar-api-angisoft\.fly\.dev/i,
  /jobs-radar\.angisoft\.co\.ke/i,
  /localhost/i,
];

/**
 * A line only counts as a network call when it looks like one. Marketing
 * links and form placeholders are not calls.
 */
const NETWORK_CALL = /fetch\s*\(|http\.(get|post|put|patch|delete)\s*\(|Uri\.parse\s*\(|launchUrl\s*\(|client\.(get|post|put|patch|delete)\s*\(/;

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
    else if (/\.(ts|tsx|js|jsx|dart|yaml|yml)$/.test(entry)) files.push(full);
  }
  return files;
}

const violations = [];

for (const root of CLIENT_ROOTS) {
  const absolute = join(repoRoot, root);
  for (const file of walk(absolute)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(line)) {
          violations.push({
            file: relative(repoRoot, file),
            line: index + 1,
            rule: rule.name,
            text: line.trim().slice(0, 120),
          });
        }
      }
    });
  }
}

/**
 * A client may only address the API. Any absolute URL to another host is a
 * boundary violation.
 */
for (const root of CLIENT_ROOTS) {
  const absolute = join(repoRoot, root);
  for (const file of walk(absolute)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!NETWORK_CALL.test(line)) return;
      const matches = line.match(/https?:\/\/[^\s"'`)]+/gi);
      if (!matches) return;
      for (const url of matches) {
        if (ALLOWED_CLIENT_HOSTS.some((host) => host.test(url))) continue;
        violations.push({
          file: relative(repoRoot, file),
          line: index + 1,
          rule: "host outside the API boundary",
          text: url.slice(0, 120),
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Boundary violations found:\n");
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line}  ${violation.rule}\n    ${violation.text}`,
    );
  }
  console.error(
    "\nThe API owns identity, business logic and every provider call.",
  );
  console.error(
    "Clients may only talk to the API. See docs/ARCHITECTURE_BOUNDARIES.md.",
  );
  process.exit(1);
}

console.log("Boundary check passed: clients only talk to the API.");
