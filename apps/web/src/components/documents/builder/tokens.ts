import type {
  ResumeFont,
  ResumeMargins,
  ResumePageSize,
  ResumeTextSize,
} from "@angisoft/mboqara-contracts";

/**
 * Resumonk-derived builder tokens.
 *
 * The values come from the authenticated Resumonk editor, but this is the
 * MboQara surface: the same feature geometry and controls, with our own
 * branding where the shell is not document content.
 */
export const BUILDER_TOKENS = {
  workspace: "#f6f0e5",
  surface: "#f9f5ee",
  sheet: "#ffffff",
  ink: "#26201a",
  inkStrong: "#1e1a17",
  muted: "#6e6258",
  faint: "#8d8273",
  line: "rgba(0, 0, 0, 0.08)",
  lineStrong: "rgba(0, 0, 0, 0.12)",
  accent: "#ff8a00",
  accentText: "#c95f00",
  accentWash: "#fff8ee",
  onAccent: "#3a2206",
  accentShadow: "rgba(255, 138, 0, 0.35) 0px 6px 20px 0px",
  sage: "#a8b9a5",
  sageInk: "#41684e",
  sageTint: "#edf4ec",
  sageWash: "#e4ebdb",
  success: "#41684e",
  warning: "#ff8a00",
  danger: "#b45309",
  radius: 12,
  radiusSmall: 9,
  radiusPill: 999,
} as const;

export const BUILDER_SHADOW = {
  flat: "rgba(0, 0, 0, 0.04) 0px 1px 2px 0px",
  card: "rgba(0, 0, 0, 0.1) 0px 1px 3px 0px",
  button: "rgba(255, 138, 0, 0.35) 0px 6px 20px 0px",
  menu: "rgba(0, 0, 0, 0.12) 0px 6px 20px 0px",
  sheet: "rgba(0, 0, 0, 0.09) 0px 10px 28px 0px",
} as const;

/** CSS pixels in one millimetre at the standard 96dpi. */
export const PX_PER_MM = 96 / 25.4;

export const SHEET_SIZE: Record<
  ResumePageSize,
  { width: number; height: number; label: string }
> = {
  letter: { width: 215.9, height: 279.4, label: "Letter" },
  a4: { width: 210, height: 297, label: "A4" },
};

export const SHEET_MARGIN_HELP: Record<keyof ResumeMargins, string> = {
  top: "Top margin in millimetres",
  right: "Right margin in millimetres",
  bottom: "Bottom margin in millimetres",
  left: "Left margin in millimetres",
};

export const SHEET_TYPE_SIZE: Record<ResumeTextSize, number> = {
  compact: 9.5,
  comfortable: 10.5,
  cozy: 11.5,
};

export const SHEET_PAGE_MM = 30;

/** A helper for the four side-by-side margin selects. */
export const SHEET_EDGES = [
  { edge: "top", label: "Top" },
  { edge: "right", label: "Right" },
  { edge: "bottom", label: "Bottom" },
  { edge: "left", label: "Left" },
] as const;

export const FONT_STACKS: Record<ResumeFont, string> = {
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

/** Colours left to the candidate; the builder shell keeps its own palette. */
export const TEXT_SWATCHES = ["#1e1a17", "#26201a", "#46413a", "#6e6258", "#41684e", "#c95f00"] as const;