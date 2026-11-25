/**
 * Ambient module declarations for dependencies that ship no types.
 *
 * These live in an imported module (rather than only in src/types/*.d.ts)
 * because the Vercel function typecheck builds its program from the entry
 * point's import graph — unimported .d.ts files never enter the program.
 */

declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }

  function pdfParse(
    buffer: Buffer,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>;

  export default pdfParse;
}

declare module "joplin-turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
  export const highlightedCodeBlock: TurndownService.Plugin;
}
