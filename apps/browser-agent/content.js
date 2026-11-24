const FRAME_READY = "MBOQARA_FRAME_READY";
const FRAME_COMMAND = "MBOQARA_FRAME_COMMAND";

function hostAllowed(host, allowedHosts) {
  const normalized = String(host || "").toLowerCase();
  return (allowedHosts || []).some((allowed) => {
    const target = String(allowed || "").toLowerCase();
    return normalized === target || normalized.endsWith(`.${target}`);
  });
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function labelText(element) {
  if (element.getAttribute("aria-label")) return element.getAttribute("aria-label").trim();
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const wrapping = element.closest("label");
  if (wrapping?.textContent) return wrapping.textContent.trim();
  const name = element.getAttribute("name") || element.id || "";
  return String(name).replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

function fieldType(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "button") return "button";
  const type = (element.getAttribute("type") || "text").toLowerCase();
  if (["checkbox", "radio", "file", "email", "tel", "number", "date"].includes(type)) return type;
  return "text";
}

function inspectFields() {
  return [...document.querySelectorAll("input, textarea, select")]
    .filter((element) => isVisible(element) && fieldType(element) !== "button")
    .map((element) => ({
      key: element.getAttribute("name") || element.id || labelText(element),
      label: labelText(element),
      type: fieldType(element),
      required: element.required || element.getAttribute("aria-required") === "true",
      value: element.type === "checkbox" || element.type === "radio"
        ? (element.checked ? "true" : "false")
        : element.value,
      options: element.tagName.toLowerCase() === "select"
        ? [...element.options].map((option) => option.value || option.textContent?.trim() || "")
        : undefined,
    }));
}

function candidatesFor(field) {
  const key = field.key || "";
  const label = field.label || key;
  const selectors = [];
  for (const value of [key, field.id].filter(Boolean)) {
    selectors.push(`[name="${CSS.escape(value)}"]`, `#${CSS.escape(value)}`);
  }
  const direct = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
  if (direct.length) return direct;
  const normalizedLabel = label.toLowerCase().trim();
  return [...document.querySelectorAll("input, textarea, select")].filter((element) => {
    const candidate = labelText(element).toLowerCase().trim();
    return candidate === normalizedLabel ||
      (normalizedLabel.length > 3 && candidate.includes(normalizedLabel));
  });
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillField(field) {
  const candidates = candidatesFor(field);
  const element = candidates.find((candidate) => isVisible(candidate)) || candidates[0];
  if (!element) return false;
  const value = field.value ?? "";

  if (field.type === "checkbox") {
    element.checked = value === true || value === "true" || value === "1";
  } else if (field.type === "radio") {
    element.checked = true;
  } else if (field.type === "select") {
    const option = [...element.options].find((candidate) =>
      candidate.value === value ||
      candidate.textContent?.trim().toLowerCase() === String(value).trim().toLowerCase(),
    );
    setNativeValue(element, option?.value ?? value);
  } else {
    setNativeValue(element, String(value));
  }
  return true;
}

function buttonByText(pattern) {
  return [...document.querySelectorAll("button, input[type=submit], [role=button]")]
    .filter(isVisible)
    .find((button) => {
      const text = button.textContent || button.value || button.getAttribute("aria-label") || "";
      return pattern.test(text.replace(/\s+/g, " ").trim());
    });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fillFields(command) {
  let filled = 0;
  for (let step = 0; step < 5; step += 1) {
    const current = inspectFields();
    for (const field of command.fields || []) {
      if (field.value === undefined || field.value === null || field.value === "") continue;
      if (fillField(field)) filled += 1;
    }

    const next = buttonByText(/^(next|continue|proceed)\b/i);
    if (!next) break;
    next.click();
    await sleep(900);
    const blocker = humanBlocker();
    if (blocker) {
      return { ok: false, blocked: true, error: blocker, fields: inspectFields() };
    }
  }
  return { ok: true, fields: inspectFields(), result: { filled } };
}

async function uploadDocuments(command) {
  const uploaded = [];
  for (const documentCommand of command.documents || []) {
    const fileInputs = [...document.querySelectorAll("input[type=file]")];
    const matching = fileInputs.filter((input) => {
      const identity = `${input.name || ""} ${input.id || ""} ${labelText(input)}`.toLowerCase();
      return (documentCommand.fieldKeys || []).some((key) => identity.includes(String(key).toLowerCase())) ||
        (documentCommand.type === "cv" && /resume|cv|curriculum/.test(identity)) ||
        (documentCommand.type === "cover_letter" && /cover/.test(identity));
    });
    const target = matching[0] || fileInputs[0];
    if (!target) continue;

    let path = documentCommand.downloadPath || "";
    if (path.startsWith("/v1/") && command.apiBase.endsWith("/v1")) path = path.slice(3);
    const response = await fetch(`${command.apiBase}${path}`, {
      headers: { authorization: `Bearer ${command.deviceToken}` },
    });
    if (!response.ok) throw new Error(`Could not download ${documentCommand.filename || "document"}`);
    const blob = await response.blob();
    const file = new File([blob], documentCommand.filename || "application-document.pdf", {
      type: blob.type || "application/pdf",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    target.files = transfer.files;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    uploaded.push(documentCommand.documentId);
  }
  return { ok: true, fields: inspectFields(), result: { uploaded } };
}

function humanBlocker() {
  const text = document.body?.innerText || "";
  const lower = text.toLowerCase();
  if (/captcha|recaptcha|hcaptcha|turnstile|verify you are human|security challenge/.test(lower)) {
    return "The employer requires a CAPTCHA or another human verification step.";
  }
  if (/one[- ]time code|verification code|mfa|sign in to continue/.test(lower)) {
    return "The employer requires you to sign in or enter a verification code.";
  }

  const legal = [...document.querySelectorAll("input[type=checkbox]")].find((input) => {
    const identity = `${input.name || ""} ${input.id || ""} ${labelText(input)}`.toLowerCase();
    return /certif|agree|terms|consent|accuracy|authorize/i.test(identity);
  });
  if (legal && !legal.checked) {
    return "The application contains a legal attestation that you must review and accept yourself.";
  }
  return null;
}

function prepareSubmission() {
  const blocker = humanBlocker();
  if (blocker) {
    return {
      ok: false,
      blocked: true,
      error: blocker,
    };
  }

  const missing = inspectFields().filter((field) =>
    field.required && field.type !== "file" && !String(field.value || "").trim(),
  );
  if (missing.length) {
    return {
      ok: false,
      needsInput: true,
      error: `The employer still needs: ${missing.map((field) => field.label).join(", ")}`,
      fields: missing,
    };
  }

  const submit = buttonByText(/\b(submit|send application|apply now|complete application)\b/i);
  if (!submit) {
    return {
      ok: false,
      needsInput: true,
      error: "The final submit button was not found. Complete the remaining step in the employer form.",
    };
  }
  return { ok: true, fields: inspectFields(), result: { readyToSubmit: true } };
}

async function submitApplication() {
  const submit = buttonByText(/\b(submit|send application|apply now|complete application)\b/i);
  if (!submit) {
    return { ok: false, failed: true, error: "The submit button was not found." };
  }
  submit.click();
  await sleep(1_500);
  const text = (document.body?.innerText || "").toLowerCase();
  const confirmed = /thank you|application (was |has been )?(received|submitted)|we have received your application|application complete/.test(text);
  if (!confirmed) {
    return {
      ok: false,
      needsInput: true,
      error: "The form was submitted, but the employer did not show a confirmation. Verify it before retrying.",
      url: location.href,
    };
  }
  return { ok: true, fields: inspectFields(), result: { confirmed: true }, url: location.href };
}

async function executeCommand(command) {
  if (!hostAllowed(location.hostname, command.allowedHosts)) {
    return {
      ok: false,
      blocked: true,
      error: `The employer page moved to ${location.hostname}, which is not approved for this application.`,
      url: location.href,
    };
  }
  if (command.type === "inspect_form") {
    return { ok: true, fields: inspectFields(), result: { inspected: true }, url: location.href };
  }
  if (command.type === "fill_fields") return fillFields(command);
  if (command.type === "upload_documents") return uploadDocuments(command);
  if (command.type === "prepare_submission") return prepareSubmission();
  if (command.type === "submit") return submitApplication();
  return { ok: false, failed: true, error: `Unknown command: ${command.type}` };
}

function announceFrame() {
  chrome.runtime.sendMessage({ type: FRAME_READY, url: location.href }).catch(() => undefined);
}

announceFrame();
// The background service worker can be suspended and lose its in-memory frame
// registry. A small heartbeat lets it rediscover the live employer frame
// without the candidate reloading the page.
window.setInterval(announceFrame, 15_000);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== FRAME_COMMAND) return false;
  executeCommand(message.command)
    .then(sendResponse)
    .catch((error) => sendResponse({
      ok: false,
      failed: true,
      error: error instanceof Error ? error.message : String(error),
      url: location.href,
    }));
  return true;
});
