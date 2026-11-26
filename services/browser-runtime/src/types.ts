import { z } from "zod";

/** Mirrors `GuidanceDetectedField` from the shared contracts. */
export interface DetectedField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  value?: string;
  options?: string[];
  manualOnly?: boolean;
}

/** Mirrors the state the web app posts back as an observation. */
export interface BrowserState {
  url: string;
  title: string;
  fields: DetectedField[];
  visibleText: string;
  blockers: string[];
}

export const sessionSchema = z.object({
  applicationId: z.string().min(1).max(120),
  guidanceSessionId: z.string().min(1).max(120),
  targetUrl: z.string().min(1).max(2048),
  /** Accepted for direct server-to-server callers; the proxy injects it. */
  token: z.string().min(1).max(512).optional(),
});

/** CSS selectors are deliberately narrow: no XPath, text engines, or JS. */
const safeSelector = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (value) =>
      !/(xpath=|text=|has-text|:has\(|\/\/|javascript:|expression\(|;|\bnew\s+Function\b|\beval\b)/i.test(
        value,
      ),
    "Only simple CSS selectors are accepted",
  );

export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("navigate"),
    url: z.string().min(1).max(2048),
  }),
  z.object({
    type: z.literal("click"),
    selector: safeSelector,
  }),
  z.object({
    type: z.literal("fill"),
    key: z.string().min(1).max(200),
    value: z.string().max(4000),
  }),
  z.object({
    type: z.literal("select"),
    key: z.string().min(1).max(200),
    value: z.string().max(4000),
  }),
  z.object({
    type: z.literal("upload"),
    key: z.string().min(1).max(200),
    /** A signed PDF URL. Unsigned arbitrary hosts are rejected by the runtime. */
    url: z.string().min(1).max(16_000_000),
    filename: z.string().min(1).max(160).optional(),
  }),
  z.object({
    type: z.literal("submit"),
    /** There is no implicit submit. This must literally be `true`. */
    confirm: z.literal(true),
    selector: safeSelector.optional(),
  }),
]);

export type RuntimeCommand = z.infer<typeof commandSchema>;
