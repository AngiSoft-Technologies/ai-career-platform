import { randomUUID } from "node:crypto";
import type {
  GuidanceDetectedField,
  GuidanceHint,
  GuidanceSuggestedAction,
  SitePlaybook,
  SitePlaybookStep,
} from "@angisoft/mboqara-contracts";
import { redactText } from "../lib/redact.js";

/**
 * Deterministic safety rules for guided applications.
 *
 * Observations arrive from a browser extension or a streamed page: they are
 * untrusted and frequently contain whatever the candidate just typed. These
 * helpers are the only place that decides what may be written to the database
 * or shown back in a hint. Field *values* are never persisted at all.
 */

const SUGGESTED_ACTIONS: readonly GuidanceSuggestedAction[] = [
  "fill",
  "upload",
  "click_next",
  "wait_for_user",
  "stop",
];

// Keys that must never be stored, even as a label: a password/OTP/card
// attestation field is a step for the candidate, not data for us.
const SENSITIVE_FIELD =
  /(password|passcode|pin\b|otp|one[-_ ]?time|card|cvv|cvc|iban|ssn|social[-_ ]?security|legal|attest|signature|authori[sz]ation|secret|token|credential)/i;

/** Emails, phone numbers, long digit runs and opaque tokens never survive. */
export function sanitiseGuidanceText(raw: string, maxLength = 2_000): string {
  return redactText(String(raw ?? ""))
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[redacted]")
    .replace(/\b\d{6,}\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function bounded(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = sanitiseGuidanceText(value, maxLength);
  return cleaned || undefined;
}

/** Field labels/keys only; a detected `value` is intentionally discarded. */
export function sanitiseDetectedFields(
  fields: GuidanceDetectedField[],
): GuidanceDetectedField[] {
  if (!Array.isArray(fields)) return [];
  return fields.slice(0, 50).flatMap((field) => {
    if (!field || typeof field !== "object") return [];
    const key = bounded(field.key, 80);
    const label = bounded(field.label, 160);
    if (!key || !label || SENSITIVE_FIELD.test(`${key} ${label}`)) return [];
    // A select option can be the typed value itself; never echo it back as
    // "harmless" metadata just because it came in through `options`.
    const typedValue = typeof field.value === "string"
      ? sanitiseGuidanceText(field.value, 200).toLowerCase()
      : "";
    const options = Array.isArray(field.options)
      ? field.options
          .map((option) => bounded(option, 120))
          .filter((option): option is string =>
            !!option && (!typedValue || option.toLowerCase() !== typedValue),
          )
          .slice(0, 20)
      : undefined;
    return [{
      key,
      label,
      type: bounded(field.type, 40) ?? "text",
      required: field.required === true,
      ...(options?.length ? { options } : {}),
      ...(field.manualOnly === true ? { manualOnly: true } : {}),
    }];
  });
}

export function sanitiseBlockers(blockers: string[]): string[] {
  if (!Array.isArray(blockers)) return [];
  return blockers
    .slice(0, 10)
    .map((blocker) => bounded(blocker, 240))
    .filter((blocker): blocker is string =>
      !!blocker && !SENSITIVE_FIELD.test(blocker),
    );
}

/**
 * A proposed playbook keeps actions and labels, never field values.
 * Unknown keys (including `value`, `answer`, `secret`) are dropped by the
 * explicit projection instead of being copied through with the object.
 */
export function sanitisePlaybookSteps(steps: unknown[]): SitePlaybookStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, 30).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const step = raw as Record<string, unknown>;
    const label = bounded(step.label, 120);
    if (!label) return [];
    const action = SUGGESTED_ACTIONS.includes(step.action as GuidanceSuggestedAction)
      ? (step.action as GuidanceSuggestedAction)
      : "wait_for_user";
    const fieldKey = bounded(step.fieldKey, 80);
    const note = bounded(step.note, 300);
    return [{
      label,
      action,
      ...(fieldKey && !SENSITIVE_FIELD.test(fieldKey) ? { fieldKey } : {}),
      ...(note ? { note } : {}),
    }];
  });
}

export function sanitiseBlockerPatterns(patterns: unknown[]): string[] {
  if (!Array.isArray(patterns)) return [];
  return patterns.slice(0, 20).map((value) => bounded(value, 200))
    .filter((value): value is string =>
      !!value && !SENSITIVE_FIELD.test(value),
    );
}

export function hostFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Stable site key for hosts that publish the same form on many subdomains. */
export function siteKeyForHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export interface HintInput {
  fields: GuidanceDetectedField[];
  blockers: string[];
  approvedFieldKeys: string[];
  playbook: SitePlaybook | null;
  now?: Date;
}

/**
 * Useful, deterministic hints from approved fields and a published playbook.
 * No model call is made here: the approved package already knows what may be
 * filled, and the playbook already knows what the page is likely to ask for.
 */
export function generateGuidanceHints(input: HintInput): GuidanceHint[] {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const hints: GuidanceHint[] = [];
  const titles = new Set<string>();

  const add = (
    title: string,
    body: string,
    severity: GuidanceHint["severity"],
    suggestedAction: GuidanceSuggestedAction,
    targetFieldKey?: string,
  ): void => {
    if (hints.length >= 3 || titles.has(title)) return;
    titles.add(title);
    hints.push({
      id: randomUUID(),
      title: sanitiseGuidanceText(title, 120),
      body: sanitiseGuidanceText(body, 500),
      severity,
      suggestedAction,
      ...(targetFieldKey ? { targetFieldKey } : {}),
      createdAt,
    });
  };

  const byKey = new Map(input.fields.map((field) => [field.key, field]));
  const approved = new Set(input.approvedFieldKeys);
  const approvedVisible = input.fields.filter(
    (field) => approved.has(field.key) && !field.manualOnly,
  );

  for (const step of input.playbook?.steps ?? []) {
    if (hints.length >= 3) break;
    const key = step.fieldKey && byKey.has(step.fieldKey)
      ? step.fieldKey
      : approvedVisible[0]?.key;

    if (step.action === "fill" || step.action === "upload") {
      if (!key || !approved.has(key)) continue;
      const field = byKey.get(key);
      add(
        step.action === "upload"
          ? `Attach the approved document for ${field?.label ?? key}`
          : `Fill ${field?.label ?? key} from your approved package`,
        step.action === "upload"
          ? "Use the generated document from this application. Do not paste personal details into a new field."
          : "This field is part of the package you approved. Copy the prepared answer across and check it before continuing.",
        "action",
        step.action,
        key,
      );
    } else if (step.action === "click_next") {
      add(
        "Continue when the page is ready",
        `Playbook: ${step.label}.${step.note ? ` ${step.note}` : ""}`,
        "info",
        "click_next",
      );
    } else if (step.action === "stop") {
      add(
        "Stop before submitting",
        `Playbook: ${step.label}. Review the whole form before you send anything.`,
        "warning",
        "stop",
      );
    }
  }

  if (hints.length === 0 && approvedVisible[0]) {
    const field = approvedVisible[0];
    add(
      `Fill ${field.label} from your approved package`,
      "You approved the answer for this field earlier. Copy it across and review it before continuing.",
      "action",
      "fill",
      field.key,
    );
  }

  if (input.blockers[0]) {
    add(
      "This page needs your attention",
      `${input.blockers[0]} Complete this step yourself; the assistant will not store credentials or attestations.`,
      "warning",
      "wait_for_user",
    );
  }

  const manual = input.fields.find(
    (field) => field.manualOnly || !approved.has(field.key),
  );
  if (manual) {
    add(
      `Complete ${manual.label} yourself`,
      "This field was not in the package you approved. Its value will not be stored or auto-filled.",
      "warning",
      "wait_for_user",
      manual.key,
    );
  }

  if (hints.length === 0) {
    add(
      "Review the page before continuing",
      "No approved field was detected on this step. Check the form visually, then continue only when you are ready.",
      "info",
      "wait_for_user",
    );
  }

  return hints;
}
