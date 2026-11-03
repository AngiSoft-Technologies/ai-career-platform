/**
 * Agent skills loader.
 *
 * Skills are the reusable playbooks agents are given at runtime. They are
 * plain Markdown with a small YAML front-matter contract, so they are
 * reviewable by a human, diffable, and cheap to version.
 *
 * The loader is intentionally simple: it reads from disk at startup and keeps
 * the parsed set in memory. A missing skill is never fatal — the agent loses
 * guidance, not function.
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../../logger.js";

export interface SkillMetadata {
  name: string;
  description: string;
  namespace?: string;
  domain?: string;
  engine?: string;
  license?: string;
  inputs?: Array<{ name: string; description: string; required: boolean }>;
}

export interface Skill {
  metadata: SkillMetadata;
  body: string;
  /** Full text including front-matter, for prompt injection. */
  raw: string;
  path: string;
}

const SKILLS_DIR = path.resolve(process.cwd(), "skills");

function parseFrontMatter(raw: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match?.[1]) return { metadata: {}, body: raw };

  const metadata: Record<string, unknown> = {};
  const lines = match[1].split("\n");
  let currentKey: string | null = null;
  let currentList: Record<string, unknown>[] | null = null;

  for (const line of lines) {
    const listItem = /^\s*-\s*name:\s*(.+)$/.exec(line);
    if (listItem && currentKey === "inputs" && currentList) {
      const entry: Record<string, unknown> = { name: listItem[1]!.trim() };
      currentList.push(entry);
      continue;
    }

    const kv = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv?.[1]) continue;

    const key = kv[1];
    const value = kv[2] ?? "";
    currentKey = key;

    if (key === "inputs" && value === "") {
      currentList = [];
      metadata[key] = currentList;
      continue;
    }

    if (currentList && /^\s{2,}\w/.test(line)) {
      // A nested property of the previous list entry.
      const last = currentList[currentList.length - 1];
      if (last) last[key!] = value.replace(/^["']|["']$/g, "");
      continue;
    }

    metadata[key!] = value.replace(/^["']|["']$/g, "");
  }

  return { metadata, body: match[2] ?? "" };
}

export async function loadSkills(directory = SKILLS_DIR): Promise<Skill[]> {
  if (!existsSync(directory)) {
    logger.warn({ directory }, "Skills directory not found");
    return [];
  }

  const skills: Skill[] = [];

  const walk = async (dir: string, depth = 0): Promise<void> => {
    if (depth > 3) return;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (entry.name !== "SKILL.md") continue;

      try {
        const raw = await readFile(full, "utf8");
        const { metadata, body } = parseFrontMatter(raw);
        const name = typeof metadata.name === "string" ? metadata.name : entry.name;
        skills.push({
          metadata: {
            name,
            description:
              typeof metadata.description === "string" ? metadata.description : "",
            namespace:
              typeof metadata.namespace === "string" ? metadata.namespace : undefined,
            domain: typeof metadata.domain === "string" ? metadata.domain : undefined,
            engine: typeof metadata.engine === "string" ? metadata.engine : undefined,
            license:
              typeof metadata.license === "string" ? metadata.license : undefined,
            inputs: Array.isArray(metadata.inputs)
              ? (metadata.inputs as Skill["metadata"]["inputs"])
              : undefined,
          },
          body,
          raw,
          path: full,
        });
      } catch (error) {
        logger.debug({ file: full, error }, "Skill load failed");
      }
    }
  };

  await walk(directory);
  return skills;
}

let cachedSkills: Skill[] | null = null;

export async function getSkills(): Promise<Skill[]> {
  if (cachedSkills) return cachedSkills;
  cachedSkills = await loadSkills();
  return cachedSkills;
}

export async function getSkill(name: string): Promise<Skill | null> {
  const skills = await getSkills();
  return skills.find((skill) => skill.metadata.name === name) ?? null;
}

/** Renders the skill catalogue an agent is allowed to use, for its prompt. */
export async function renderSkillCatalogue(
  filter?: { domain?: string; engine?: string },
): Promise<string> {
  const skills = await getSkills();
  const selected = skills.filter((skill) => {
    if (filter?.domain && skill.metadata.domain !== filter.domain) return false;
    if (filter?.engine && skill.metadata.engine !== filter.engine) return false;
    return true;
  });

  if (selected.length === 0) return "No skills available.";

  return selected
    .map(
      (skill) =>
        `### ${skill.metadata.name}\n${skill.metadata.description}\n` +
        `${skill.body.split("\n").slice(1, 24).join("\n")}`,
    )
    .join("\n\n---\n\n");
}
