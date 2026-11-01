/**
 * Resume / cover letter template catalogue contracts.
 *
 * The authoritative catalogue lives in the `resume_templates` and
 * `cover_letter_templates` tables, seeded by
 * `db/migrations/020_template_catalogue.sql`.
 *
 * The fallbacks below mirror that catalogue row-for-row and exist only so the
 * web and API can still render a usable picker when the table read fails.
 * Every key here must exist in the migration — an unknown key produces an
 * unstyled export, so keep these two lists in sync when adding a template.
 */

export interface ResumeTemplateSummary {
  key: string;
  label: string;
  category: string;
  description: string;
  atsSafe: boolean;
  accent: string;
  sortOrder: number;
}

export interface CoverLetterTemplateSummary {
  key: string;
  label: string;
  tone: string;
  description: string;
  sortOrder: number;
}

export interface TemplateCatalogue {
  resume: ResumeTemplateSummary[];
  coverLetter: CoverLetterTemplateSummary[];
}

/** Fallback used when a document has never had a template saved. */
export const DEFAULT_RESUME_TEMPLATE_KEY = "ats-classic";

/** Fallback used when a cover letter has never had a template saved. */
export const DEFAULT_COVER_LETTER_TEMPLATE_KEY = "professional";

export const FALLBACK_RESUME_TEMPLATES: readonly ResumeTemplateSummary[] = [
  {
    key: "ats-classic",
    label: "ATS Classic",
    category: "ats",
    description: "Single column, standard headings, system font. The safest possible layout.",
    atsSafe: true,
    accent: "#1f2937",
    sortOrder: 10,
  },
  {
    key: "ats-modern",
    label: "ATS Modern",
    category: "ats",
    description: "Modern typography, subtle accent colour, one column. Parses cleanly.",
    atsSafe: true,
    accent: "#1d4ed8",
    sortOrder: 30,
  },
  {
    key: "ats-minimal",
    label: "ATS Minimal",
    category: "ats",
    description: "No rules, no colour, no icons. Pure text an ATS cannot misread.",
    atsSafe: true,
    accent: "#000000",
    sortOrder: 40,
  },
  {
    key: "chronological",
    label: "Chronological",
    category: "chronological",
    description: "Most recent role first, reverse-chronological. Best for continuous careers.",
    atsSafe: true,
    accent: "#334155",
    sortOrder: 50,
  },
  {
    key: "hybrid",
    label: "Hybrid",
    category: "hybrid",
    description: "A skills summary up top, then reverse-chronological history. Best for career changers.",
    atsSafe: true,
    accent: "#0f766e",
    sortOrder: 60,
  },
  {
    key: "executive",
    label: "Executive",
    category: "executive",
    description: "Profile-led layout for senior roles, with a concise impact summary.",
    atsSafe: true,
    accent: "#111827",
    sortOrder: 80,
  },
  {
    key: "technical",
    label: "Technical",
    category: "technical",
    description: "Skills, projects and tooling grouped for engineering resumes.",
    atsSafe: true,
    accent: "#065f46",
    sortOrder: 90,
  },
];

export const FALLBACK_COVER_LETTER_TEMPLATES: readonly CoverLetterTemplateSummary[] = [
  {
    key: "professional",
    label: "Professional",
    tone: "professional",
    description: "Standard business letter. Works for almost every role.",
    sortOrder: 10,
  },
  {
    key: "concise",
    label: "Concise",
    tone: "concise",
    description: "Three short paragraphs. For recruiters who read fast.",
    sortOrder: 20,
  },
  {
    key: "enthusiastic",
    label: "Enthusiastic",
    tone: "enthusiastic",
    description: "Warmer opening. Best for teams and culture-driven roles.",
    sortOrder: 30,
  },
  {
    key: "technical",
    label: "Technical",
    tone: "technical",
    description: "Leads with evidence and tooling rather than enthusiasm.",
    sortOrder: 40,
  },
];
