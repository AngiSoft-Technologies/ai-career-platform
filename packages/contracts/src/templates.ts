/**
 * Resume / cover letter template catalogue contracts.
 *
 * The authoritative catalogue is seeded from the same list Resumonk uses so
 * the builder can offer its exact template set: 21 resume layouts, 18 type
 * families, six accent colours, three densities, two page sizes and
 * independent margins in millimetres.
 */

export interface ResumeTemplateSummary {
  /** Stable slug used by previews, exports and saved documents. */
  key: string;
  label: string;
  category: string;
  description: string;
  atsSafe: boolean;
  accent: string;
  sortOrder: number;
  /** Free templates can be used without a paid plan. */
  free?: boolean;
  /** Photo templates place a portrait in the contact block. */
  photo?: boolean;
  /** Photo templates cannot export as DOCX in Resumonk. */
  docx?: boolean;
  /** Locked templates are visible but require an upgrade. */
  locked?: boolean;
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
export const DEFAULT_RESUME_TEMPLATE_KEY = "zen";

/** Fallback used when a cover letter has never had a template saved. */
export const DEFAULT_COVER_LETTER_TEMPLATE_KEY = "professional";

/** The default resume template accent: the Resumonk free-tier accent. */
export const DEFAULT_RESUME_ACCENT = "#ff8a00";

/**
 * The exact 21 Resumonk resume templates captured from the authenticated
 * account. `key` is the slug Resumonk uses in `layout`, previews and
 * downloads.
 */
export const RESUME_TEMPLATE_CATALOGUE: readonly ResumeTemplateSummary[] = [
  {
    key: "zen",
    label: "Zen",
    category: "free",
    description: "Balanced one-page layout with a clean headline block.",
    atsSafe: true,
    accent: "#ff8a00",
    sortOrder: 10,
    free: true,
    photo: true,
    docx: false,
    locked: false,
  },
  {
    key: "elegant",
    label: "Elegant",
    category: "free",
    description: "Restrained serif styling for professional roles.",
    atsSafe: true,
    accent: "#1e1a17",
    sortOrder: 20,
    free: true,
    photo: false,
    docx: true,
    locked: false,
  },
  {
    key: "clear",
    label: "Clear",
    category: "free",
    description: "Plain, readable layout that keeps content first.",
    atsSafe: true,
    accent: "#14532d",
    sortOrder: 30,
    free: true,
    photo: true,
    docx: false,
    locked: false,
  },
  {
    key: "classica",
    label: "Classica",
    category: "free",
    description: "Traditional CV structure for conservative employers.",
    atsSafe: true,
    accent: "#7a2e1e",
    sortOrder: 40,
    free: true,
    photo: false,
    docx: true,
    locked: false,
  },
  {
    key: "sleek",
    label: "Sleek",
    category: "free",
    description: "Compact spacing for dense experience sections.",
    atsSafe: true,
    accent: "#1e3a5f",
    sortOrder: 50,
    free: true,
    photo: false,
    docx: true,
    locked: false,
  },
  {
    key: "simplimo",
    label: "Simplimo",
    category: "free",
    description: "Minimal rules, quiet type and generous whitespace.",
    atsSafe: true,
    accent: "#4a2a6b",
    sortOrder: 60,
    free: true,
    photo: false,
    docx: true,
    locked: false,
  },
  {
    key: "elemental",
    label: "Elemental",
    category: "premium",
    description: "Strong section hierarchy with accent rules.",
    atsSafe: true,
    accent: "#0f766e",
    sortOrder: 70,
    free: false,
    photo: true,
    docx: false,
    locked: true,
  },
  {
    key: "regal",
    label: "Regal",
    category: "premium",
    description: "Executive layout for senior and leadership resumes.",
    atsSafe: true,
    accent: "#7a2e1e",
    sortOrder: 80,
    free: false,
    photo: true,
    docx: false,
    locked: true,
  },
  {
    key: "bold",
    label: "Bold",
    category: "premium",
    description: "High-contrast headings and confident rhythm.",
    atsSafe: true,
    accent: "#ff8a00",
    sortOrder: 90,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "concrete",
    label: "Concrete",
    category: "premium",
    description: "Structured blocks with generous labelling.",
    atsSafe: true,
    accent: "#1e1a17",
    sortOrder: 100,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "concise",
    label: "Concise",
    category: "premium",
    description: "Short, direct presentation for fast recruiters.",
    atsSafe: true,
    accent: "#14532d",
    sortOrder: 110,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "slim",
    label: "Slim",
    category: "premium",
    description: "Narrow sidebar rhythm for long documents.",
    atsSafe: true,
    accent: "#1e3a5f",
    sortOrder: 120,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "collegium",
    label: "Collegium",
    category: "premium",
    description: "Academic styling built for research histories.",
    atsSafe: true,
    accent: "#7a2e1e",
    sortOrder: 130,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "charisma",
    label: "Charisma",
    category: "premium",
    description: "Warm, people-first layout for client-facing roles.",
    atsSafe: true,
    accent: "#ff8a00",
    sortOrder: 140,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "slate",
    label: "Slate",
    category: "premium",
    description: "Cool, technical layout for engineering resumes.",
    atsSafe: true,
    accent: "#0f766e",
    sortOrder: 150,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "modernism",
    label: "Modernism",
    category: "premium",
    description: "Modern type pairing and strong section headings.",
    atsSafe: true,
    accent: "#4a2a6b",
    sortOrder: 160,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "stylismo",
    label: "Stylismo",
    category: "premium",
    description: "Creative layout with expressive headline treatment.",
    atsSafe: true,
    accent: "#ff8a00",
    sortOrder: 170,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "prestige",
    label: "Prestige",
    category: "premium",
    description: "Formal, presentation-led layout for senior roles.",
    atsSafe: true,
    accent: "#1e1a17",
    sortOrder: 180,
    free: false,
    photo: false,
    docx: true,
    locked: true,
  },
  {
    key: "vivid",
    label: "Vivid",
    category: "premium",
    description: "Colour-forward layout with portrait support.",
    atsSafe: true,
    accent: "#ff8a00",
    sortOrder: 190,
    free: false,
    photo: true,
    docx: false,
    locked: true,
  },
  {
    key: "vibrant",
    label: "Vibrant",
    category: "premium",
    description: "Energetic layout with a portrait block.",
    atsSafe: true,
    accent: "#0f766e",
    sortOrder: 200,
    free: false,
    photo: true,
    docx: false,
    locked: true,
  },
  {
    key: "avant",
    label: "Avant",
    category: "premium",
    description: "Distinctive editorial layout with portrait support.",
    atsSafe: true,
    accent: "#4a2a6b",
    sortOrder: 210,
    free: false,
    photo: true,
    docx: false,
    locked: true,
  },
];

/** The six Resumonk accent colours. */
export const RESUME_ACCENT_COLOURS: readonly string[] = [
  "#0F766E",
  "#1E1A17",
  "#7A2E1E",
  "#1E3A5F",
  "#4A2A6B",
  "#14532D",
] as const;

/** The three Resumonk print densities. */
export const RESUME_DENSITIES: readonly string[] = [
  "compact",
  "comfortable",
  "cozy",
] as const;

export const FALLBACK_RESUME_TEMPLATES = RESUME_TEMPLATE_CATALOGUE;

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