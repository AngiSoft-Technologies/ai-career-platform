import type { Page } from "playwright";
import { isSensitiveField, redactValue, redactVisibleText } from "./redact.js";
import type { BrowserState, DetectedField } from "./types.js";

interface RawField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  value?: string;
  options?: string[];
}

interface RawState {
  url: string;
  title: string;
  visibleText: string;
  fields: RawField[];
  blockers: string[];
}

/**
 * Reads the page without executing caller-supplied JavaScript.
 *
 * Every candidate field is tagged with a stable `data-mboqara-key` so commands
 * can target it by key rather than by a caller-controlled selector. Values for
 * sensitive fields are dropped here, before the state ever reaches the API.
 */
export async function extractState(page: Page): Promise<BrowserState> {
  const raw = await page.evaluate((): RawState => {
    const used = new Set<string>();
    const nodes = Array.from(
      document.querySelectorAll("input, select, textarea, [contenteditable='true']"),
    );

    const fields = nodes.map((node, index): RawField => {
      const el = node as HTMLElement;
      const labelledBy = el.getAttribute("aria-labelledby");
      const labelledByText = labelledBy
        ? document.getElementById(labelledBy)?.innerText?.trim()
        : undefined;
      const associated = Array.from(document.querySelectorAll("label")).find(
        (label) =>
          label.control === (el as HTMLInputElement) || label.contains(el),
      );
      const label =
        labelledByText ||
        el.getAttribute("aria-label")?.trim() ||
        associated?.innerText.trim() ||
        el.getAttribute("placeholder")?.trim() ||
        el.getAttribute("name")?.trim() ||
        el.id?.trim() ||
        `Field ${index + 1}`;

      const baseKey =
        el.id?.trim() ||
        el.getAttribute("name")?.trim() ||
        el.getAttribute("aria-label")?.trim() ||
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "") ||
        `field_${index + 1}`;
      let key = baseKey.slice(0, 120);
      if (used.has(key)) key = `${key.slice(0, 110)}_${index + 1}`;
      used.add(key);
      el.setAttribute("data-mboqara-key", key);

      let type = "text";
      let value: string | undefined;
      let options: string[] | undefined;

      if (el instanceof HTMLInputElement) {
        type = el.type || "text";
        if (type === "checkbox" || type === "radio") {
          value = el.checked ? "checked" : "";
        } else if (type === "file") {
          value = el.files?.[0]?.name;
        } else {
          value = el.value;
        }
      } else if (el instanceof HTMLSelectElement) {
        type = "select-one";
        value = el.value;
        options = Array.from(el.options)
          .map((option) => option.textContent?.trim() || option.value)
          .filter(Boolean)
          .slice(0, 100);
      } else if (el instanceof HTMLTextAreaElement) {
        type = "textarea";
        value = el.value;
      } else {
        type = "textbox";
        value = el.innerText.trim();
      }

      return {
        key,
        label,
        type,
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
        value,
        options,
      };
    });

    const visibleText = document.body?.innerText?.slice(0, 20_000) ?? "";
    const dialogs = Array.from(
      document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog[open]'),
    )
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => (node as HTMLElement).innerText?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 6);

    return {
      url: window.location.href,
      title: document.title,
      visibleText,
      fields,
      blockers: dialogs,
    };
  });

  const blockerPatterns = [
    /captcha/i,
    /verify you are human/i,
    /access denied/i,
    /sign.?in required/i,
    /login required/i,
    /enable javascript/i,
    /unsupported browser/i,
    /automation.*(blocked|detected)/i,
  ];

  const blockers = new Set(raw.blockers.map((item) => item.slice(0, 240)));
  for (const line of raw.visibleText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length < 8 || trimmed.length > 200) continue;
    if (blockerPatterns.some((pattern) => pattern.test(trimmed))) {
      blockers.add(trimmed);
    }
  }
  if (blockers.size >= 12) {
    // Keep the set deterministic when many lines match.
    blockers.delete([...blockers].at(-1) ?? "");
  }

  const fields: DetectedField[] = raw.fields.map((field) => {
    const manualOnly =
      isSensitiveField(field.label, field.key, field.type) ||
      field.type === "file" ||
      field.type === "password";
    return {
      key: field.key,
      label: field.label.slice(0, 200),
      type: field.type,
      required: field.required,
      value: redactValue(field.value, field.label, field.key, field.type),
      options: field.options,
      manualOnly,
    };
  });

  return {
    url: raw.url,
    title: raw.title.slice(0, 300),
    fields,
    visibleText: redactVisibleText(raw.visibleText),
    blockers: [...blockers].slice(0, 12),
  };
}

export async function fieldByKey(page: Page, key: string): Promise<DetectedField | null> {
  const state = await extractState(page);
  return state.fields.find((field) => field.key === key) ?? null;
}

export function selectorForKey(key: string): string {
  const escaped = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[data-mboqara-key="${escaped}"]`;
}
