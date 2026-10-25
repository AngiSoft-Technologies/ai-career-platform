"use client";

export interface DocSection {
  id: string;
  heading: string;
  body: string;
}

export interface ParsedDocument {
  title: string;
  sections: DocSection[];
}

const HEADING_HINTS = [
  "contact",
  "personal",
  "summary",
  "profile",
  "objective",
  "experience",
  "employment",
  "education",
  "skills",
  "projects",
  "certifications",
  "awards",
  "languages",
  "interests",
  "references",
  "volunteering",
  "publications",
  "work history",
];

export function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return false;
  const lower = trimmed.toLowerCase().replace(/[:\s]+$/, "");
  if (HEADING_HINTS.some((hint) => lower === hint || lower.startsWith(`${hint} `))) return true;
  if (trimmed === trimmed.toUpperCase() && /[A-Z]{3,}/.test(trimmed) && trimmed.length < 42) return true;
  if (/^#{1,3}\s+/.test(trimmed)) return true;
  return false;
}

export function parseDocument(content: string): ParsedDocument {
  const lines = content.split("\n");
  const sections: DocSection[] = [];
  let title = "Document";
  let current: DocSection | null = null;
  let firstHeading = true;

  for (const line of lines) {
    if (isHeading(line)) {
      const cleaned = line.trim().replace(/^#{1,3}\s+/, "").replace(/:$/, "");
      if (current) sections.push(current);
      current = {
        id: `sec-${Math.random().toString(36).slice(2, 10)}`,
        heading: cleaned,
        body: "",
      };
      if (firstHeading) {
        title = cleaned;
        firstHeading = false;
      }
      continue;
    }
    if (current) {
      current.body += `${current.body ? "\n" : ""}${line}`;
    } else if (line.trim()) {
      title = line.trim();
      current = {
        id: `sec-${Math.random().toString(36).slice(2, 10)}`,
        heading: "Summary",
        body: "",
      };
    }
  }
  if (current) sections.push(current);

  if (sections.length === 0) {
    sections.push({
      id: `sec-${Math.random().toString(36).slice(2, 10)}`,
      heading: "Summary",
      body: content,
    });
  }

  return { title, sections: sections.map((section) => ({ ...section, body: section.body.trim() })) };
}

export function serialiseDocument(title: string, sections: DocSection[]): string {
  return sections
    .filter((section) => section.heading.trim() || section.body.trim())
    .map((section) => `${section.heading.trim()}\n${section.body.trim()}`)
    .join("\n\n");
}

export const STARTER_SECTIONS: Array<Pick<DocSection, "heading" | "body">> = [
  {
    heading: "Contact",
    body: "Your Name\nyour.email@example.com\n+254 700 000 000\nNairobi, Kenya\nlinkedin.com/in/yourname",
  },
  {
    heading: "Summary",
    body: "Two or three sentences on what you do, the kind of work you want, and the value you bring.",
  },
  {
    heading: "Experience",
    body: "Job Title — Company, City\n2023 — Present\n• Achievement with a measurable result.\n• Another achievement with a measurable result.\n\nPrevious Role — Previous Company\n2021 — 2023\n• What you owned and what changed because of it.",
  },
  {
    heading: "Education",
    body: "Degree, Institution\n2020 — 2024\n\nRelevant coursework or honours if they strengthen your case.",
  },
  {
    heading: "Skills",
    body: "Skill one, Skill two, Skill three, Skill four, Skill five, Skill six",
  },
];

export function sectionKeywords(section: DocSection): string[] {
  return section.body
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/)
    .filter((token) => token.length > 3);
}

export function buildPreviewHtml(title: string, sections: DocSection[]): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">");

  const renderBody = (body: string) =>
    body
      .split(/\n{2,}/)
      .filter((block) => block.trim())
      .map((block) => {
        const lines = block.split("\n");
        const isBulletList = lines.every((line) => /^\s*([-*•·]|\d+[.)])\s+/.test(line));
        if (isBulletList) {
          const items = lines
            .map((line) => `<li>${escape(line.replace(/^\s*([-*•·]|\d+[.)])\s+/, ""))}</li>`)
            .join("");
          return `<ul>${items}</ul>`;
        }
        return `<p>${escape(block).replace(/\n/g, "<br/>")}</p>`;
      })
      .join("");

  return sections
    .filter((section) => section.heading.trim() || section.body.trim())
    .map(
      (section) =>
        `<h2>${escape(section.heading)}</h2>${renderBody(section.body)}`,
    )
    .join("");
}
