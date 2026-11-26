import type { ApplicationSubmissionMethod } from "@angisoft/mboqara-contracts";

/**
 * An approved blueprint decides how a run is submitted.
 *
 * Email and mailto applications are assembled into a compose window the
 * candidate sends; everything else stays on the browser protocol. This is
 * metadata on the run — the fields, documents and browser commands are
 * unchanged — so exposing it does not alter how the browser agent claims
 * or advances a run.
 */
export function submissionMethodForBlueprint(
  method: string | null | undefined,
): ApplicationSubmissionMethod {
  const normalized = (method ?? "").trim().toLowerCase();
  return normalized === "email" || normalized === "mailto"
    ? "manual_email"
    : "browser";
}
