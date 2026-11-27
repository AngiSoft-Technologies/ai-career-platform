/**
 * Structured document model for the resume editor.
 *
 * A document is stored twice, on purpose:
 *
 * - `resumeData` is the structured truth: an ordered list of sections, each
 *   holding typed entries (a role, a qualification, a skill). The editor
 *   reads and writes this.
 * - `content` is the flat text every other part of the platform already
 *   understands — ATS checks, tailoring, exports, the mobile client. It is
 *   regenerated from `resumeData` whenever the structured form changes.
 *
 * Keeping both means the editor can be as structured as it needs to be
 * without breaking the parsers that already read a document as text.
 */

import { RESUME_TEMPLATE_CATALOGUE } from "./templates.js";

export type ResumeSectionType =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "publications"
  | "volunteering"
  | "honors"
  | "awards"
  | "languages"
  | "certifications"
  | "recommendations"
  | "custom";

export type ResumeTextSize = "compact" | "comfortable" | "cozy";
export type ResumePageSize = "letter" | "a4";

/** Legacy single-margin values, kept so existing documents still open. */
export type ResumeMargin = "narrow" | "normal" | "wide";

/** The exact Resumonk type catalogue. */
export type ResumeFont =
  | "amaranth"
  | "arvo"
  | "aurulent"
  | "bitstream"
  | "blokletters"
  | "cantarell"
  | "dosis"
  | "droidserif"
  | "latin"
  | "lato"
  | "lora"
  | "monda"
  | "montserrat"
  | "opensans"
  | "oswald"
  | "raleway"
  | "roboto"
  | "ubuntu";

export interface ResumeContact {
  /** Resumonk writes the first name separately; old documents keep `fullName`. */
  fullName: string;
  lastName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
}

export interface ResumeEntry {
  id: string;
  /** Job title, degree, project name, skill name — whatever the section means. */
  title: string;
  /** Employer, institution, publisher, awarding body. */
  organisation: string;
  location: string;
  /** Single date field, as Resumonk writes it: "May 2025 – Present". */
  date: string;
  startDate: string;
  endDate: string;
  /** "Present" — an open-ended range. */
  current: boolean;
  url: string;
  /** Free text under the heading. */
  summary: string;
  /** Achievements, one per line. */
  bullets: string[];
  /** Skills, technologies, languages — short labels. */
  tags: string[];
}

export interface ResumeSection {
  id: string;
  type: ResumeSectionType;
  /** The heading the reader sees. Every section can be renamed. */
  title: string;
  entries: ResumeEntry[];
  /** Pinned sections cannot be dragged out of position. */
  pinned?: boolean;
}

/** Independent print margins in millimetres, one per edge. */
export interface ResumeMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResumeDesign {
  font: ResumeFont;
  textColor: string;
  /** The accent used for headings, rules and links. */
  accentColor: string;
  textSize: ResumeTextSize;
  pageSize: ResumePageSize;
  /** Current, exact margins. */
  margins: ResumeMargins;
  /** Backwards-compatible legacy margin bucket. */
  margin?: ResumeMargin;
  /** Optional portrait, shown only by templates that have a photo slot. */
  photoUrl?: string;
}

/** The structured cover-letter fields before they are flattened to text. */
export interface ResumeCoverLetter {
  recipientName: string;
  recipientCompany: string;
  recipientAddress: string;
  subject: string;
  greeting: string;
  body: string;
  signoff: string;
}

/** A resume is built from sections; a cover letter is one letter. */
export type ResumeDocumentKind = "resume" | "cover_letter";

export interface ResumeDocument {
  kind: ResumeDocumentKind;
  contact: ResumeContact;
  sections: ResumeSection[];
  design: ResumeDesign;
  coverLetter?: ResumeCoverLetter;
}

// ---------------------------------------------------------------------------
// The section catalogue
// ---------------------------------------------------------------------------

export type ResumeEntryField =
  | "title"
  | "organisation"
  | "location"
  | "date"
  | "startDate"
  | "endDate"
  | "current"
  | "url"
  | "summary"
  | "bullets"
  | "tags";

export interface ResumeFieldLabel {
  field: ResumeEntryField;
  label: string;
  placeholder?: string;
  /** Longer inputs get a taller box. */
  long?: boolean;
}

export interface ResumeSectionDefinition {
  type: ResumeSectionType;
  label: string;
  /** What one entry is called, used in buttons: "Add new role". */
  entryLabel: string;
  /** The heading the section starts with. */
  defaultTitle: string;
  /** A section made of one block of text rather than a list of entries. */
  singleBlock?: boolean;
  /** Experience can be inserted at the top as well as the end. */
  addAtTop?: boolean;
  fields: ResumeFieldLabel[];
}

const CUSTOM_SECTION_FIELDS: ResumeFieldLabel[] = [
  { field: "title", label: "Heading", placeholder: "What this entry is called" },
  { field: "organisation", label: "Subheading", placeholder: "Where it was, or who it was for" },
  { field: "date", label: "Date(s)", placeholder: "e.g. 2024" },
  { field: "summary", label: "Details", long: true, placeholder: "Anything worth adding…" },
];

const CUSTOM_SECTION_DEFINITION: ResumeSectionDefinition = {
  type: "custom",
  label: "Custom section",
  entryLabel: "entry",
  defaultTitle: "New section",
  fields: CUSTOM_SECTION_FIELDS,
};

export const RESUME_SECTION_CATALOG: readonly ResumeSectionDefinition[] = [
  {
    type: "summary",
    label: "Summary",
    entryLabel: "summary",
    defaultTitle: "Summary",
    singleBlock: true,
    fields: [
      {
        field: "summary",
        label: "Summary",
        long: true,
        placeholder: "Two or three sentences on what you do and the value you bring.",
      },
    ],
  },
  {
    type: "experience",
    label: "Experience",
    entryLabel: "experience",
    defaultTitle: "Experience",
    addAtTop: true,
    fields: [
      { field: "title", label: "Designation", placeholder: "e.g. Senior Financial Analyst" },
      { field: "organisation", label: "Company", placeholder: "e.g. Acme Technologies" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      {
        field: "summary",
        label: "Details",
        long: true,
        placeholder: "What did you do? Short bullet points read best…",
      },
    ],
  },
  {
    type: "education",
    label: "Education",
    entryLabel: "education",
    defaultTitle: "Education",
    fields: [
      { field: "title", label: "Degree", placeholder: "e.g. Bachelor of Commerce" },
      { field: "organisation", label: "Institute", placeholder: "e.g. Northgate University" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      {
        field: "summary",
        label: "Details",
        long: true,
        placeholder: "Coursework, honors, activities…",
      },
    ],
  },
  {
    type: "skills",
    label: "Skills",
    entryLabel: "skills",
    defaultTitle: "Skills",
    singleBlock: true,
    fields: [
      {
        field: "summary",
        label: "Skills",
        long: true,
        placeholder: "Group your skills, e.g. Tools: Excel, Tally ERP, Zoho Books",
      },
    ],
  },
  {
    type: "projects",
    label: "Projects",
    entryLabel: "project",
    defaultTitle: "Projects",
    fields: [
      { field: "title", label: "Project title", placeholder: "e.g. Automated MIS Pipeline" },
      { field: "url", label: "URL", placeholder: "e.g. github.com/…" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      {
        field: "summary",
        label: "Details",
        long: true,
        placeholder: "What it was, what you built, what changed…",
      },
    ],
  },
  {
    type: "publications",
    label: "Publications",
    entryLabel: "publication",
    defaultTitle: "Publications",
    fields: [
      { field: "title", label: "Title", placeholder: "e.g. Practical GST Compliance" },
      { field: "organisation", label: "Publisher", placeholder: "e.g. The Ledger Quarterly" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      {
        field: "summary",
        label: "Details",
        long: true,
        placeholder: "Write some details about this publication…",
      },
    ],
  },
  {
    type: "volunteering",
    label: "Volunteering",
    entryLabel: "volunteering position",
    defaultTitle: "Volunteering",
    fields: [
      { field: "title", label: "Cause", placeholder: "e.g. Financial literacy" },
      { field: "organisation", label: "Organization", placeholder: "e.g. Riverbend Literacy Trust" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      {
        field: "summary",
        label: "Details",
        long: true,
        placeholder: "What you did and who it helped…",
      },
    ],
  },
  {
    type: "honors",
    label: "Honors",
    entryLabel: "honor",
    defaultTitle: "Honors",
    fields: [
      { field: "title", label: "Title", placeholder: "e.g. Rank holder, CA Final" },
      { field: "organisation", label: "Issuer", placeholder: "e.g. Northgate University" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      {
        field: "summary",
        label: "Details",
        long: true,
        placeholder: "Why it was awarded…",
      },
    ],
  },
  {
    type: "awards",
    label: "Awards",
    entryLabel: "award",
    defaultTitle: "Awards",
    fields: [
      { field: "title", label: "Award", placeholder: "e.g. Innovation Award" },
      { field: "organisation", label: "Awarded by", placeholder: "e.g. Body name" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      { field: "url", label: "Link", placeholder: "https://" },
      { field: "summary", label: "Details", long: true },
    ],
  },
  {
    type: "languages",
    label: "Languages",
    entryLabel: "language",
    defaultTitle: "Languages",
    fields: [
      { field: "title", label: "Language", placeholder: "e.g. Hindi" },
      { field: "summary", label: "Proficiency", placeholder: "e.g. Native" },
    ],
  },
  {
    type: "certifications",
    label: "Certifications",
    entryLabel: "certification",
    defaultTitle: "Certifications",
    fields: [
      { field: "title", label: "Title", placeholder: "e.g. Certified Public Accountant" },
      { field: "organisation", label: "Certifying Authority", placeholder: "e.g. Acme Institute of Accountancy" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      { field: "url", label: "Credential link", placeholder: "https://" },
      { field: "summary", label: "Details", long: true, placeholder: "What it covers…" },
    ],
  },
  {
    type: "recommendations",
    label: "Recommendations",
    entryLabel: "recommendation",
    defaultTitle: "Recommendations",
    fields: [
      { field: "title", label: "Name", placeholder: "e.g. Priya Menon" },
      { field: "organisation", label: "Designation", placeholder: "e.g. Finance Director, Acme Technologies" },
      { field: "date", label: "Date(s)", placeholder: "e.g. August 2023 to Present" },
      {
        field: "summary",
        label: "Recommendation",
        long: true,
        placeholder: "What they said…",
      },
    ],
  },
  {
    ...CUSTOM_SECTION_DEFINITION,
  },
];

export function sectionDefinition(
  type: ResumeSectionType,
): ResumeSectionDefinition {
  return (
    RESUME_SECTION_CATALOG.find((definition) => definition.type === type) ??
    CUSTOM_SECTION_DEFINITION
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The 18 typefaces Resumonk offers in the preview/design controls. */
export const RESUME_FONTS: ReadonlyArray<{ key: ResumeFont; label: string }> = [
  { key: "amaranth", label: "Amaranth" },
  { key: "arvo", label: "Arvo" },
  { key: "aurulent", label: "Aurulent Sans" },
  { key: "bitstream", label: "Bitstream Vera Sans Mono" },
  { key: "blokletters", label: "Blokletters Balpen" },
  { key: "cantarell", label: "Cantarell" },
  { key: "dosis", label: "Dosis" },
  { key: "droidserif", label: "Droid Serif" },
  { key: "latin", label: "Latin Modern Mono" },
  { key: "lato", label: "Lato" },
  { key: "lora", label: "Lora" },
  { key: "monda", label: "Monda" },
  { key: "montserrat", label: "Montserrat" },
  { key: "opensans", label: "Open Sans" },
  { key: "oswald", label: "Oswald" },
  { key: "raleway", label: "Raleway" },
  { key: "roboto", label: "Roboto Slab" },
  { key: "ubuntu", label: "Ubuntu" },
];

export const RESUME_TEXT_SIZES: ReadonlyArray<{
  key: ResumeTextSize;
  label: string;
}> = [
  { key: "compact", label: "Compact" },
  { key: "comfortable", label: "Comfortable" },
  { key: "cozy", label: "Cozy" },
];

export const RESUME_PAGE_SIZES: ReadonlyArray<{
  key: ResumePageSize;
  label: string;
}> = [
  { key: "letter", label: "Letter" },
  { key: "a4", label: "A4" },
];

/** Legacy margin labels; new documents store four independent edges. */
export const RESUME_MARGINS: ReadonlyArray<{ key: ResumeMargin; label: string }> = [
  { key: "narrow", label: "Narrow" },
  { key: "normal", label: "Normal" },
  { key: "wide", label: "Wide" },
];

/** CSS font stack for each Resumonk typeface. */
export const RESUME_FONT_STACKS: Record<ResumeFont, string> = {
  amaranth: "Amaranth, Georgia, serif",
  arvo: "Arvo, Georgia, serif",
  aurulent: "'Aurulent Sans', system-ui, sans-serif",
  bitstream: "'Bitstream Vera Sans Mono', ui-monospace, monospace",
  blokletters: "'Blokletters Balpen', cursive",
  cantarell: "Cantarell, system-ui, sans-serif",
  dosis: "Dosis, system-ui, sans-serif",
  droidserif: "'Droid Serif', Georgia, serif",
  latin: "'Latin Modern Mono', ui-monospace, monospace",
  lato: "Lato, system-ui, sans-serif",
  lora: "var(--font-resume-serif), Georgia, serif",
  monda: "Monda, system-ui, sans-serif",
  montserrat: "Montserrat, system-ui, sans-serif",
  opensans: "'Open Sans', system-ui, sans-serif",
  oswald: "Oswald, system-ui, sans-serif",
  raleway: "Raleway, system-ui, sans-serif",
  roboto: "'Roboto Slab', Georgia, serif",
  ubuntu: "Ubuntu, system-ui, sans-serif",
};

/** Legacy single margins map to millimetre edges so old PDFs stay equal. */
export function legacyMarginToMillimetres(margin: ResumeMargin): ResumeMargins {
  switch (margin) {
    case "narrow":
      return { top: 12, right: 12, bottom: 12, left: 12 };
    case "wide":
      return { top: 22, right: 22, bottom: 22, left: 22 };
    default:
      return { top: 16, right: 16, bottom: 16, left: 16 };
  }
}

// ---------------------------------------------------------------------------
// Template shapes
// ---------------------------------------------------------------------------

/**
 * How a template arranges the sheet.
 *
 * The catalogue has a hundred keys; they do not need a hundred layouts. Each
 * key is reduced to one of a handful of shapes, and the sheet on screen and
 * the PDF that prints are drawn from the same shape — so what the candidate
 * edits is what they download.
 */
export interface ResumeTemplateShape {
  /** The template has a place for a portrait. */
  photo: boolean;
  /** Section headings carry the accent colour. */
  colouredHeadings: boolean;
  /** A rule sits under the contact block. */
  contactRule: boolean;
  /** A left border beside the name. */
  nameBorder: boolean;
  /** A rule sits under each section heading. */
  headingRule: boolean;
}

const CLASSIC_SHAPE: ResumeTemplateShape = {
  photo: false,
  colouredHeadings: false,
  contactRule: true,
  nameBorder: false,
  headingRule: false,
};

const MODERN_SHAPE: ResumeTemplateShape = {
  photo: false,
  colouredHeadings: true,
  contactRule: true,
  nameBorder: true,
  headingRule: false,
};

const MINIMAL_SHAPE: ResumeTemplateShape = {
  photo: false,
  colouredHeadings: false,
  contactRule: false,
  nameBorder: false,
  headingRule: false,
};

const ELEGANT_SHAPE: ResumeTemplateShape = {
  photo: false,
  colouredHeadings: false,
  contactRule: true,
  nameBorder: false,
  headingRule: false,
};

const STRUCTURED_SHAPE: ResumeTemplateShape = {
  photo: false,
  colouredHeadings: true,
  contactRule: false,
  nameBorder: false,
  headingRule: true,
};

/** Templates that show a portrait beside the contact block. */
const PHOTO_TEMPLATE_KEYS = new Set(
  RESUME_TEMPLATE_CATALOGUE.filter((template) => template.photo).map(
    (template) => template.key,
  ),
);

/** DOCX-capable templates, mirrored from the captured Resumonk catalogue. */
export const DOCX_TEMPLATE_KEYS = new Set(
  RESUME_TEMPLATE_CATALOGUE.filter((template) => template.docx).map(
    (template) => template.key,
  ),
);

const TEMPLATE_SHAPES: Record<string, ResumeTemplateShape> = {
  zen: CLASSIC_SHAPE,
  elegant: ELEGANT_SHAPE,
  clear: MINIMAL_SHAPE,
  classica: CLASSIC_SHAPE,
  sleek: MINIMAL_SHAPE,
  simplimo: MINIMAL_SHAPE,
  elemental: MODERN_SHAPE,
  regal: ELEGANT_SHAPE,
  bold: STRUCTURED_SHAPE,
  concrete: STRUCTURED_SHAPE,
  concise: MINIMAL_SHAPE,
  slim: MINIMAL_SHAPE,
  collegium: ELEGANT_SHAPE,
  charisma: MODERN_SHAPE,
  slate: STRUCTURED_SHAPE,
  modernism: MODERN_SHAPE,
  stylismo: MODERN_SHAPE,
  prestige: ELEGANT_SHAPE,
  vivid: MODERN_SHAPE,
  vibrant: MODERN_SHAPE,
  avant: MODERN_SHAPE,
};

/** The shape a template key stands for. */
export function resumeTemplateShape(key: string): ResumeTemplateShape {
  const normalized = (key ?? "").trim().toLowerCase();
  const explicit = TEMPLATE_SHAPES[normalized];
  if (explicit) return explicit;
  if (PHOTO_TEMPLATE_KEYS.has(normalized)) {
    return { ...MODERN_SHAPE, photo: true };
  }
  return CLASSIC_SHAPE;
}

/** Template metadata for a saved slug, with safe defaults for unknown keys. */
export function resumeTemplateMetadata(key: string): {
  key: string;
  label: string;
  free: boolean;
  photo: boolean;
  docx: boolean;
  locked: boolean;
  accent: string;
} {
  const normalized = (key ?? "").trim().toLowerCase();
  const template = RESUME_TEMPLATE_CATALOGUE.find((item) => item.key === normalized);
  return {
    key: template?.key ?? normalized,
    label: template?.label ?? (normalized || "Template"),
    free: template?.free ?? true,
    photo: template?.photo ?? false,
    docx: template?.docx ?? true,
    locked: template?.locked ?? false,
    accent: template?.accent ?? "#ff8a00",
  };
}

export function emptyResumeEntry(): ResumeEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 10)}`,
    title: "",
    organisation: "",
    location: "",
    date: "",
    startDate: "",
    endDate: "",
    current: false,
    url: "",
    summary: "",
    bullets: [],
    tags: [],
  };
}

export function emptyResumeDocument(kind: ResumeDocumentKind = "resume"): ResumeDocument {
  return {
    kind,
    contact: {
      fullName: "",
      lastName: "",
      headline: "",
      email: "",
      phone: "",
      location: "",
      website: "",
      linkedin: "",
    },
    sections: [],
    design: {
      font: "lora",
      textColor: "#1e1a17",
      accentColor: "#ff8a00",
      textSize: "comfortable",
      pageSize: "letter",
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      margin: "normal",
    },
    coverLetter:
      kind === "cover_letter"
        ? {
            recipientName: "",
            recipientCompany: "",
            recipientAddress: "",
            subject: "",
            greeting: "",
            body: "",
            signoff: "",
          }
        : undefined,
  };
}

/** Normalises a single margin edge, clamped exactly as Resumonk allows. */
function marginEdge(value: unknown, fallback: number): number {
  const numeric = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(30, Math.max(0, Math.round(numeric)));
}

function text(value: unknown, max = 4_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function textList(value: unknown, max = 60): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 400))
    .filter(Boolean)
    .slice(0, max);
}

const SECTION_TYPES = new Set<string>(RESUME_SECTION_CATALOG.map((d) => d.type));

/**
 * Coerces whatever the client sent into the exact shape the editor and the
 * exporter can rely on. Unknown fields are dropped, oversized lists are
 * trimmed, and every section keeps a stable id.
 */
export function normaliseResumeDocument(value: unknown): ResumeDocument {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const contactSource =
    typeof source.contact === "object" && source.contact !== null
      ? (source.contact as Record<string, unknown>)
      : {};
  const designSource =
    typeof source.design === "object" && source.design !== null
      ? (source.design as Record<string, unknown>)
      : {};

  const base = emptyResumeDocument();
  const kind: ResumeDocumentKind =
    text(source.kind, 40) === "cover_letter" ? "cover_letter" : "resume";
  const textSize = text(designSource.textSize, 40) as ResumeTextSize;
  const pageSize = text(designSource.pageSize, 40) as ResumePageSize;
  const margin = text(designSource.margin, 40) as ResumeMargin;
  const textColor = text(designSource.textColor, 20);
  const accentColor = text(designSource.accentColor, 20);
  const photoUrl = text(designSource.photoUrl, 600);
  const font = normaliseFont(designSource.font);
  const fallbackMargins = legacyMarginToMillimetres(
    RESUME_MARGINS.some((item) => item.key === margin) ? margin : "normal",
  );
  const marginSource =
    typeof designSource.margins === "object" && designSource.margins !== null
      ? (designSource.margins as Record<string, unknown>)
      : {};
  const margins = {
    top: marginEdge(marginSource.top, fallbackMargins.top),
    right: marginEdge(marginSource.right, fallbackMargins.right),
    bottom: marginEdge(marginSource.bottom, fallbackMargins.bottom),
    left: marginEdge(marginSource.left, fallbackMargins.left),
  };

  const sections = Array.isArray(source.sections)
    ? source.sections.slice(0, 40).map((raw, index) => {
        const section =
          typeof raw === "object" && raw !== null
            ? (raw as Record<string, unknown>)
            : {};
        const type = text(section.type, 40) as ResumeSectionType;
        const entries = Array.isArray(section.entries)
          ? section.entries.slice(0, 60).map((entryRaw) => {
              const entry =
                typeof entryRaw === "object" && entryRaw !== null
                  ? (entryRaw as Record<string, unknown>)
                  : {};
              return {
                id: text(entry.id, 80) || `entry-${index}-${Math.random().toString(36).slice(2, 8)}`,
                title: text(entry.title, 400),
                organisation: text(entry.organisation, 400),
                location: text(entry.location, 300),
                date: text(entry.date, 120),
                startDate: text(entry.startDate, 40),
                endDate: text(entry.endDate, 40),
                current: Boolean(entry.current),
                url: text(entry.url, 600),
                summary: text(entry.summary, 6_000),
                bullets: textList(entry.bullets),
                tags: textList(entry.tags, 40),
              };
            })
          : [];
        // Resumonk treats Skills as one grouped block, while old MboQara
        // documents stored one entry per skill. Flatten them so no evidence
        // is lost when the exact UI opens.
        const skillsEntry = entries[0] ?? emptyResumeEntry();
        const normalisedEntries =
          type === "skills"
            ? [
                {
                  ...skillsEntry,
                  id:
                    skillsEntry.id ||
                    `entry-${index}-${Math.random().toString(36).slice(2, 8)}`,
                  title: "",
                  organisation: "",
                  location: "",
                  date: "",
                  startDate: "",
                  endDate: "",
                  current: false,
                  url: "",
                  bullets: [],
                  tags: [],
                  summary: entries
                    .map((entry) =>
                      entry.summary.trim() ||
                      [entry.title, entry.tags.join(", ")].filter(Boolean).join(", "),
                    )
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .join("\n"),
                },
              ]
            : entries;

        return {
          id: text(section.id, 80) || `section-${index}-${Math.random().toString(36).slice(2, 8)}`,
          type: SECTION_TYPES.has(type) ? type : ("custom" as ResumeSectionType),
          // An empty title is kept: a cover letter's body section has no
          // heading, and the sheet falls back to the catalogue's default
          // label when it needs one.
          title: text(section.title, 120),
          entries: normalisedEntries,
          pinned: index === 0 && section.pinned !== false,
        };
      })
    : [];

  return {
    kind,
    contact: {
      fullName: text(contactSource.fullName, 160) || text(contactSource.name, 160),
      lastName: text(contactSource.lastName, 160),
      headline: text(contactSource.headline, 240),
      email: text(contactSource.email, 240),
      phone: text(contactSource.phone, 80),
      location: text(contactSource.location, 200),
      website: text(contactSource.website, 400),
      linkedin: text(contactSource.linkedin, 400),
    },
    sections,
    design: {
      font,
      textColor: /^#[0-9a-f]{6}$/i.test(textColor) ? textColor : base.design.textColor,
      accentColor: /^#[0-9a-f]{6}$/i.test(accentColor)
        ? accentColor
        : base.design.accentColor,
      textSize: RESUME_TEXT_SIZES.some((item) => item.key === textSize)
        ? textSize
        : base.design.textSize,
      pageSize: RESUME_PAGE_SIZES.some((item) => item.key === pageSize)
        ? pageSize
        : base.design.pageSize,
      margins,
      margin: RESUME_MARGINS.some((item) => item.key === margin)
        ? margin
        : base.design.margin,
      photoUrl: photoUrl || undefined,
    },
    coverLetter: kind === "cover_letter" ? normaliseCoverLetter(source.coverLetter, sections) : undefined,
  };
}

/** Maps legacy and stored font slugs onto the exact 18-font catalogue. */
function normaliseFont(value: unknown): ResumeFont {
  const normalized = text(value, 40).toLowerCase();
  if (RESUME_FONTS.some((item) => item.key === normalized)) {
    return normalized as ResumeFont;
  }
  const legacy: Record<string, ResumeFont> = {
    hanken: "lora",
    inter: "opensans",
    georgia: "arvo",
    times: "arvo",
    corbel: "cantarell",
    calibri: "opensans",
    helvetica: "lato",
  };
  return legacy[normalized] ?? "lora";
}

function normaliseCoverLetter(
  value: unknown,
  sections: ResumeSection[],
): ResumeCoverLetter {
  const empty = {
    recipientName: "",
    recipientCompany: "",
    recipientAddress: "",
    subject: "",
    greeting: "",
    body: "",
    signoff: "",
  };
  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    return {
      recipientName: text(source.recipientName, 240),
      recipientCompany: text(source.recipientCompany, 240),
      recipientAddress: text(source.recipientAddress, 400),
      subject: text(source.subject, 240),
      greeting: text(source.greeting, 120),
      body: text(source.body, 20_000),
      signoff: text(source.signoff, 120),
    };
  }

  // Legacy documents hold the whole letter in an untitled custom section.
  const legacy = sections.find((section) => !section.title.trim());
  return legacy
    ? { ...empty, body: legacy.entries[0]?.summary ?? "" }
    : empty;
}

/**
 * The flat text every other part of the platform reads.
 *
 * Section headings become Markdown level-two headings so the exporter and the
 * ATS checker can see where a section starts, including sections whose title
 * the candidate renamed.
 */
export function resumeDocumentToMarkdown(document: ResumeDocument): string {
  const { contact, sections } = document;
  const isLetter = document.kind === "cover_letter";
  const displayName = [contact.fullName, contact.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const header = [
    displayName,
    contact.headline,
    [contact.email, contact.phone, contact.location, contact.website, contact.linkedin]
      .filter(Boolean)
      .join(" · "),
  ]
    .filter((value) => value.trim().length > 0)
    .join("\n");

  const blocks: string[] = [];
  if (header.trim()) blocks.push(header);

  if (isLetter && document.coverLetter) {
    const letter = document.coverLetter;
    const lines = [
      letter.recipientName,
      letter.recipientCompany,
      letter.recipientAddress,
      letter.subject ? `Subject: ${letter.subject}` : "",
      letter.greeting,
      letter.body,
      letter.signoff,
    ]
      .map((value) => value.trim())
      .filter(Boolean);
    if (lines.length) blocks.push(...lines);
    return blocks.join("\n\n").trim();
  }

  for (const section of sections) {
    const title = section.title.trim() || sectionDefinition(section.type).defaultTitle;
    const definition = sectionDefinition(section.type);

    if (definition.singleBlock) {
      const body = section.entries
        .map((entry) => entry.summary.trim())
        .filter(Boolean)
        .join("\n\n");
      if (body) blocks.push(`## ${title}\n${body}`);
      continue;
    }

    const entries = section.entries.filter(
      (entry) =>
        entry.title.trim() ||
        entry.organisation.trim() ||
        entry.summary.trim() ||
        entry.bullets.some((bullet) => bullet.trim()) ||
        entry.tags.some((tag) => tag.trim()),
    );
    if (!entries.length) continue;

    const rendered = entries
      .map((entry) => {
        const lines: string[] = [];
        const heading = [entry.title.trim(), entry.organisation.trim()]
          .filter(Boolean)
          .join(" — ");
        if (heading) lines.push(heading);

        const date =
          entry.date.trim() ||
          [
            entry.startDate.trim(),
            entry.current ? "Present" : entry.endDate.trim(),
          ]
            .filter(Boolean)
            .join(" – ");
        const meta = [entry.location.trim(), date].filter(Boolean).join(" · ");
        if (meta) lines.push(meta);

        if (entry.summary.trim()) lines.push(entry.summary.trim());
        for (const bullet of entry.bullets) {
          if (bullet.trim()) lines.push(`- ${bullet.trim()}`);
        }
        if (entry.tags.length) lines.push(entry.tags.join(", "));
        if (entry.url.trim()) lines.push(entry.url.trim());
        return lines.join("\n");
      })
      .join("\n\n");

    // A cover letter is prose, not a list of sections: a body block with no
    // title of its own is written as it stands.
    if (isLetter && !section.title.trim()) {
      blocks.push(rendered);
      continue;
    }

    blocks.push(`## ${title}\n${rendered}`);
  }

  return blocks.join("\n\n").trim();
}

const HEADING_TO_TYPE: Record<string, ResumeSectionType> = {
  summary: "summary",
  "professional summary": "summary",
  profile: "summary",
  objective: "summary",
  "about me": "summary",
  experience: "experience",
  "work experience": "experience",
  employment: "experience",
  "work history": "experience",
  education: "education",
  skills: "skills",
  "core skills": "skills",
  "technical skills": "skills",
  projects: "projects",
  publications: "publications",
  volunteering: "volunteering",
  "volunteer experience": "volunteering",
  honors: "honors",
  honours: "honors",
  awards: "awards",
  languages: "languages",
  certifications: "certifications",
  "certificates": "certifications",
  recommendations: "recommendations",
  references: "recommendations",
};

/** A line that carries a place and a date range, as older resumes write it. */
const YEAR_RANGE = /(\b(?:19|20)\d{2}\b)\s*[–—-]\s*(present|current|\b(?:19|20)\d{2}\b)/i;

/** A line that is nothing but a date range, e.g. "2014 – 2018". */
const ONLY_YEAR_RANGE =
  /^(?:19|20)\d{2}\s*[–—-]\s*(?:present|current|(?:19|20)\d{2})\.?$/i;

/**
 * Reads the line under a heading — the one that usually says where and when
 * something happened — into the fields that hold it.
 */
function parseEntryMeta(line: string): Partial<ResumeEntry> | null {
  const trimmed = line.trim();
  const hasRange = YEAR_RANGE.test(trimmed);
  const hasSeparator = /\s[·|]\s/.test(trimmed);
  // A line is meta when it is only a date range, or when it separates a
  // place from a date range. Anything else is prose and is kept as prose.
  if (!hasRange && !hasSeparator) return null;
  if (hasRange && !hasSeparator && !ONLY_YEAR_RANGE.test(trimmed)) return null;

  const meta: Partial<ResumeEntry> = {};
  for (const segment of trimmed.split(/\s*[·|]\s+/).filter(Boolean)) {
    const range = YEAR_RANGE.exec(segment);
    if (range?.[1] && range[2]) {
      meta.startDate = range[1];
      const tail = range[2].toLowerCase();
      if (tail === "present" || tail === "current") meta.current = true;
      else meta.endDate = range[2];
      continue;
    }
    if (/^(?:19|20)\d{2}$/.test(segment)) {
      if (!meta.startDate) meta.startDate = segment;
      else if (!meta.endDate) meta.endDate = segment;
      continue;
    }
    if (!meta.location) meta.location = segment;
  }
  if (!meta.location && !meta.startDate && !meta.endDate && !meta.current) return null;
  return meta;
}

/**
 * Best-effort import of a document that was written before the structured
 * editor existed. Nothing is thrown away: a heading the catalogue does not
 * know becomes a custom section, and unlabelled lines become a summary.
 */
export function markdownToResumeDocument(
  content: string,
  kind: ResumeDocumentKind = "resume",
): ResumeDocument {
  const document = emptyResumeDocument(kind);
  const source = (content ?? "").replace(/\r\n/g, "\n");

  // A cover letter is prose. It is kept whole, so the candidate finds their
  // own words when they open an old letter.
  if (kind === "cover_letter") {
    const body = source.trim();
    document.sections = body
      ? [
          {
            id: "letter-body",
            type: "custom",
            title: "",
            entries: [{ ...emptyResumeEntry(), summary: body }],
            pinned: true,
          },
        ]
      : [];
    return normaliseResumeDocument(document);
  }

  let current: ResumeSection | null = null;
  const contactLines: string[] = [];

  const pushEntryLine = (line: string, afterBlank: boolean): void => {
    if (!current) {
      contactLines.push(line);
      return;
    }
    const definition = sectionDefinition(current.type);
    if (definition.singleBlock) {
      const entry = current.entries[0] ?? emptyResumeEntry();
      entry.summary = entry.summary ? `${entry.summary}\n${line}` : line;
      if (!current.entries.length) current.entries.push(entry);
      return;
    }

    // A blank line followed by a line that names a role or a date range is
    // the start of the next role.
    const startsNext =
      afterBlank &&
      (/\s[—–]\s/.test(line) || YEAR_RANGE.test(line)) &&
      current.entries.length > 0;
    let entry = current.entries[current.entries.length - 1];
    if (!entry || startsNext) {
      entry = emptyResumeEntry();
      current.entries.push(entry);
    }

    if (/^\s*[-*•·]\s+/.test(line)) {
      entry.bullets.push(line.replace(/^\s*[-*•·]\s+/, ""));
      return;
    }
    // The line under a role usually says where and when. It is read before
    // the title split so "Nairobi, Kenya · 2022 – Present" lands in the date
    // and place fields even though the role already has its title.
    if (!entry.location && !entry.startDate && !entry.endDate) {
      const meta = parseEntryMeta(line);
      if (meta) {
        Object.assign(entry, meta);
        return;
      }
    }
    // "Role — Company" on one line is two fields.
    if (!entry.title && !entry.organisation) {
      const split = /^(.{2,80}?)\s+[—–]\s+(.{2,80})$/.exec(line);
      if (split?.[1] && split[2]) {
        entry.title = split[1];
        entry.organisation = split[2];
        return;
      }
    }
    if (!entry.title && !entry.organisation) {
      entry.title = line;
      return;
    }
    if (!entry.organisation) {
      entry.organisation = line;
      return;
    }
    entry.summary = entry.summary ? `${entry.summary}\n${line}` : line;
  };

  let afterBlank = false;
  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    const markdownHeading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    const headingText = markdownHeading
      ? (markdownHeading[2] ?? "").trim().replace(/:$/, "")
      : null;
    // A plain-text heading is the heading word and nothing else. "Languages —
    // TypeScript, Go" is a line of content, not a heading.
    const plainHeading = /^(summary|professional summary|profile|objective|about me|experience|work experience|employment|work history|education|skills|core skills|technical skills|projects|publications|volunteering|volunteer experience|honors|honours|awards|languages|certifications|certificates|recommendations|references)\s*:?$/i.test(
      trimmed,
    );
    const looksLikeHeading = headingText !== null || plainHeading;

    if (looksLikeHeading) {
      const title = (headingText ?? trimmed).replace(/:$/, "");
      const type = HEADING_TO_TYPE[title.toLowerCase()] ?? "custom";
      if (current) document.sections.push(current);
      current = {
        id: `section-${document.sections.length}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        entries: [],
        pinned: document.sections.length === 0,
      };
      afterBlank = false;
      continue;
    }

    if (!trimmed) {
      afterBlank = true;
      continue;
    }
    pushEntryLine(trimmed, afterBlank);
    afterBlank = false;
  }
  if (current) document.sections.push(current);

  // The first lines above the first heading are the contact block.
  const firstHeadingLine = source
    .split("\n")
    .findIndex((line) => /^(#{1,6})\s+/.test(line.trim()));
  if (firstHeadingLine > 0) {
    const header = source
      .split("\n")
      .slice(0, firstHeadingLine)
      .map((line) => line.trim())
      .filter(Boolean);
    if (header[0]) document.contact.fullName = header[0];
    if (header[1] && !header[1].includes("@")) document.contact.headline = header[1];
    const contactLine = header.find((line) => line.includes("@") || line.includes("·"));
    if (contactLine) {
      const parts = contactLine.split(/[·|]/).map((part) => part.trim());
      for (const part of parts) {
        if (part.includes("@")) document.contact.email = part;
        else if (/\+?\d[\d\s().-]{7,}\d/.test(part)) document.contact.phone = part;
        else if (/linkedin\.com/i.test(part)) document.contact.linkedin = part;
        else if (/^https?:|www\./i.test(part)) document.contact.website = part;
        else if (!document.contact.location) document.contact.location = part;
      }
    }
  } else if (contactLines.length) {
    const joined = contactLines.join(" ");
    const email = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.exec(joined)?.[0];
    const phone = /(\+?\d[\d\s().-]{7,}\d)/.exec(joined)?.[0];
    if (email) document.contact.email = email;
    if (phone) document.contact.phone = phone;
  }

  if (document.sections.length === 0) {
    document.sections.push({
      id: "section-summary",
      type: "summary",
      title: "Summary",
      entries: [
        {
          ...emptyResumeEntry(),
          summary: source.trim(),
        },
      ],
      pinned: true,
    });
  }

  return normaliseResumeDocument(document);
}
