import { createHash } from "node:crypto";
import type { ApplicationMissingInput } from "@angisoft/mboqara-contracts";

export type HumanAction =
  | "authentication"
  | "identity_verification"
  | "legal_attestation"
  | "manual_entry";

export interface PolicyField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  suggestedValue?: string;
  reason?: string;
  options?: string[];
}

export interface PolicyQuestion {
  question: string;
  answer: string;
  requiresUserInput: boolean;
  reason?: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 16);
}

/** Stable server key for a free-form screening answer. */
export function answerInputKey(question: string): string {
  return `answer:${digest(question)}`;
}

/** Stable server key for a step the candidate must complete personally. */
export function manualFieldInputKey(fieldKey: string): string {
  return `manual:${digest(fieldKey)}`;
}

/**
 * Classifies fields the agent must never fill on the candidate's behalf.
 *
 * Passwords, one-time codes and legal attestations are not ordinary missing
 * fields. Asking the candidate to type a password into MboQara would create a
 * credential store; accepting a legal term automatically would be worse.
 */
export function humanActionForField(field: {
  key: string;
  label: string;
  type: string;
}): HumanAction | null {
  const identity = `${field.key} ${field.label}`.toLowerCase();
  if (
    field.type === "password" ||
    /\b(password|passcode|pass word|sign in|log in|login)\b/.test(identity)
  ) {
    return "authentication";
  }
  if (/\b(otp|one[- ]time|verification code|security code|2fa|mfa|2-step|identity verification)\b/.test(identity)) {
    return "identity_verification";
  }
  if (/\b(certif|attest|agree|terms|consent|accuracy|authorize|legal)\b/.test(identity)) {
    return "legal_attestation";
  }
  return null;
}

export function humanActionLabel(action: HumanAction): string {
  switch (action) {
    case "authentication":
      return "Sign in yourself";
    case "identity_verification":
      return "Complete identity verification yourself";
    case "legal_attestation":
      return "Review and accept the legal statement yourself";
    case "manual_entry":
      return "Complete this step yourself";
  }
}

/**
 * Computes the exact information still needed before an application can be
 * approved. Only values the agent can safely derive are treated as complete;
 * legal and authentication steps remain explicit human actions.
 */
export function missingApplicationInputs(input: {
  fields: PolicyField[];
  questions: PolicyQuestion[];
  userInputs: Record<string, string>;
  emailRecipient?: string;
  method?: string;
}): ApplicationMissingInput[] {
  const missing = new Map<string, ApplicationMissingInput>();

  for (const field of input.fields) {
    if (!field.required) continue;

    const humanAction = humanActionForField(field);
    if (humanAction) {
      const key = manualFieldInputKey(field.key);
      if (!input.userInputs[key]?.trim()) {
        missing.set(key, {
          key,
          label: field.label || field.key,
          type: "boolean",
          reason: `${humanActionLabel(humanAction)}. Complete it on the employer's page; the agent will not type or accept it for you.`,
          required: true,
          requiresManualAction: true,
        });
      }
      continue;
    }

    if (field.type === "file") {
      if (/resume|cv|curriculum|cover/.test(`${field.key} ${field.label}`)) {
        // The prepared resume and cover letter are uploaded by the agent.
        continue;
      }

      // Other uploads (for example a transcript or portfolio) are personal
      // documents that the service cannot accept, store, or upload on the
      // candidate's behalf. Record only that the candidate completed the
      // step; never turn the upload into a server-held value.
      const key = manualFieldInputKey(field.key);
      if (!input.userInputs[key]?.trim()) {
        missing.set(key, {
          key,
          label: field.label || field.key,
          type: "boolean",
          reason: "Upload this file yourself on the employer's page. MboQara cannot accept or store this document.",
          required: true,
          requiresManualAction: true,
        });
      }
      continue;
    }

    const supplied = input.userInputs[field.key]?.trim();
    if (supplied || field.suggestedValue?.trim()) continue;
    missing.set(field.key, {
      key: field.key,
      label: field.label || field.key,
      type: fieldInputType(field.type),
      reason: field.reason ?? "The employer requires this value and it is not present in your profile.",
      required: true,
      options: field.options,
    });
  }

  for (const answer of input.questions) {
    if (!answer.requiresUserInput) continue;
    const key = answerInputKey(answer.question);
    if (input.userInputs[key]?.trim()) continue;
    missing.set(key, {
      key,
      label: answer.question,
      type: "textarea",
      reason: answer.reason ?? "The agent could not find a truthful answer in your profile or documents.",
      required: true,
    });
  }

  if (input.method === "email" && !input.emailRecipient?.trim()) {
    missing.set("application_recipient", {
      key: "application_recipient",
      label: "Application recipient",
      type: "email",
      reason: "The employer did not publish a clear application email address.",
      required: true,
    });
  }

  return [...missing.values()];
}

function fieldInputType(type: string): ApplicationMissingInput["type"] {
  if (type === "tel") return "tel";
  if (type === "email") return "email";
  if (type === "select" || type === "radio") return "select";
  if (type === "textarea") return "textarea";
  if (type === "file") return "file";
  if (type === "checkbox") return "boolean";
  if (type === "number") return "number";
  if (type === "date") return "date";
  return "text";
}

/**
 * A successful browser report must match the command the server issued.
 * Without this check, a delayed report could skip upload or review.
 */
export function isExpectedSubmissionStep(
  currentStep: string,
  reportedStep: string,
): boolean {
  return currentStep === reportedStep;
}

/**
 * The server never treats a clicked button as proof of delivery. A successful
 * submission needs an explicit confirmation produced by the employer page.
 */
export function isConfirmedSubmission(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      (result as { confirmed?: unknown }).confirmed === true,
  );
}

/** True when a report URL belongs to one of the hosts approved for the run. */
export function isAllowedSubmissionHost(
  url: string | undefined,
  allowedHosts: string[],
): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((allowed) => {
      const target = allowed.toLowerCase();
      return host === target || host.endsWith(`.${target}`);
    });
  } catch {
    return false;
  }
}
