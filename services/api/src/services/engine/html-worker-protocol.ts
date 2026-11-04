/**
 * The contract between the API process and the HTML worker.
 *
 * Types only — this module compiles away, so both sides can share it
 * without pulling any runtime code across the thread boundary.
 */

import type { CleanOptions, HtmlProcessingResult } from "./html.js";

export interface HtmlWorkerRequest {
  id: number;
  html: string;
  options: CleanOptions;
  url?: string;
}

export interface HtmlWorkerResponse {
  id: number;
  ok: boolean;
  result?: HtmlProcessingResult;
  error?: string;
}
