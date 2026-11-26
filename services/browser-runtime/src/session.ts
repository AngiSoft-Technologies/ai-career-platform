import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { config } from "./config.js";
import { extractState, fieldByKey, selectorForKey } from "./dom.js";
import { HttpError } from "./errors.js";
import { isSensitiveField } from "./redact.js";
import { loadPdf } from "./upload.js";
import type { BrowserState, RuntimeCommand } from "./types.js";

let browserPromise: Promise<Browser> | null = null;

function browser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-extensions"],
      })
      .catch((error: unknown) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }
  if (host.includes("::ffff:")) {
    return isPrivateHost(host.slice(host.lastIndexOf(":") + 1));
  }
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function navigationUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "INVALID_URL", "The navigation URL is not valid");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new HttpError(400, "UNSAFE_URL", "Only HTTP(S) pages can be opened");
  }
  if (url.username || url.password) {
    throw new HttpError(400, "UNSAFE_URL", "Credentials in page URLs are not accepted");
  }
  if (isPrivateHost(url.hostname) && !config.allowPrivateNavigation) {
    throw new HttpError(403, "PRIVATE_HOST_BLOCKED", "Private network hosts are blocked");
  }
  return url;
}

/**
 * One workspace owns one in-memory browser context. "Persistent" here means
 * the context survives across HTTP polls for the life of the session — it is
 * never a Chromium profile written to disk, so it inherits no logins and
 * leaves no cookies behind when the session closes.
 */
class BrowserSession {
  readonly id: string;
  readonly applicationId: string;
  readonly guidanceSessionId: string;
  readonly targetUrl: string;
  readonly createdAt: string;
  updatedAt: string;

  private readonly context: BrowserContext;
  private readonly page: Page;
  private lastFrameAt = 0;
  private closed = false;

  constructor(input: {
    id: string;
    applicationId: string;
    guidanceSessionId: string;
    targetUrl: string;
    context: BrowserContext;
    page: Page;
  }) {
    this.id = input.id;
    this.applicationId = input.applicationId;
    this.guidanceSessionId = input.guidanceSessionId;
    this.targetUrl = input.targetUrl;
    this.context = input.context;
    this.page = input.page;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
  }

  touch(): void {
    this.updatedAt = new Date().toISOString();
  }

  get idleMs(): number {
    return Date.now() - new Date(this.updatedAt).getTime();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new HttpError(410, "SESSION_CLOSED", "This browser session has closed");
    }
  }

  async frame(): Promise<Buffer> {
    this.assertOpen();
    const now = Date.now();
    if (now - this.lastFrameAt < config.frameIntervalMs) {
      const retryAfter = Math.ceil((config.frameIntervalMs - (now - this.lastFrameAt)) / 1000);
      throw new HttpError(429, "FRAME_RATE_LIMITED", "Slow down frame polling", retryAfter);
    }
    this.lastFrameAt = now;
    this.touch();
    return this.page.screenshot({
      type: "jpeg",
      quality: 62,
      animations: "disabled",
      caret: "hide",
      timeout: 10_000,
    });
  }

  async state(): Promise<BrowserState> {
    this.assertOpen();
    this.touch();
    return extractState(this.page);
  }

  async execute(command: RuntimeCommand): Promise<Record<string, unknown>> {
    this.assertOpen();
    this.touch();
    switch (command.type) {
      case "navigate": {
        const url = navigationUrl(command.url);
        await this.page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        return { url: this.page.url() };
      }
      case "click": {
        await this.page.locator(command.selector).first().click({ timeout: 8_000 });
        return { clicked: command.selector, url: this.page.url() };
      }
      case "fill":
        return this.fill(command.key, command.value);
      case "select":
        return this.select(command.key, command.value);
      case "upload":
        return this.upload(command.key, command.url, command.filename);
      case "submit": {
        if (command.confirm !== true) {
          throw new HttpError(403, "CONFIRMATION_REQUIRED", "Submit requires confirm: true");
        }
        // Explicit user confirmation is the only path to this click. The
        // runtime never submits on navigation, observation or hint ack.
        const selector =
          command.selector ?? 'button[type="submit"], input[type="submit"]';
        await this.page.locator(selector).first().click({ timeout: 8_000 });
        return { submitted: true, url: this.page.url() };
      }
    }
  }

  private async fill(key: string, value: string): Promise<Record<string, unknown>> {
    const field = await fieldByKey(this.page, key);
    if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "That field is not on the page");
    if (
      field.manualOnly ||
      isSensitiveField(field.label, field.key, field.type) ||
      field.type === "password" ||
      field.type === "file"
    ) {
      throw new HttpError(403, "MANUAL_FIELD", "This field must be completed by the candidate");
    }
    if (field.type.startsWith("select")) {
      throw new HttpError(400, "WRONG_FIELD_TYPE", "Use the select command for dropdowns");
    }
    const locator = this.page.locator(selectorForKey(key)).first();
    if (field.type === "checkbox" || field.type === "radio") {
      if (value === "checked" || value.toLowerCase() === "true") {
        await locator.check({ timeout: 8_000 });
      } else {
        await locator.uncheck({ timeout: 8_000 });
      }
      return { filled: key, checked: value === "checked" || value.toLowerCase() === "true" };
    }
    await locator.fill(value, { timeout: 8_000 });
    return { filled: key };
  }

  private async select(key: string, value: string): Promise<Record<string, unknown>> {
    const field = await fieldByKey(this.page, key);
    if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "That field is not on the page");
    if (field.manualOnly || isSensitiveField(field.label, field.key, field.type)) {
      throw new HttpError(403, "MANUAL_FIELD", "This field must be completed by the candidate");
    }
    if (!field.type.startsWith("select")) {
      throw new HttpError(400, "WRONG_FIELD_TYPE", "That field is not a dropdown");
    }
    const locator = this.page.locator(selectorForKey(key)).first();
    try {
      await locator.selectOption(value, { timeout: 8_000 });
    } catch {
      await locator.selectOption({ label: value }, { timeout: 8_000 });
    }
    return { selected: key };
  }

  private async upload(
    key: string,
    url: string,
    filename?: string,
  ): Promise<Record<string, unknown>> {
    const field = await fieldByKey(this.page, key);
    if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "That field is not on the page");
    if (field.type !== "file") {
      throw new HttpError(400, "WRONG_FIELD_TYPE", "That field is not a file input");
    }
    const pdf = await loadPdf(url);
    await this.page
      .locator(selectorForKey(key))
      .first()
      .setInputFiles(
        {
          name: (filename ?? pdf.filename).replace(/[^a-zA-Z0-9._-]/g, "_"),
          mimeType: "application/pdf",
          buffer: pdf.buffer,
        },
        { timeout: 8_000 },
      );
    return { uploaded: key, bytes: pdf.buffer.length };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.context.close().catch(() => undefined);
  }
}

const sessions = new Map<string, BrowserSession>();

export function sessionCount(): number {
  return sessions.size;
}

export async function createSession(input: {
  applicationId: string;
  guidanceSessionId: string;
  targetUrl: string;
}): Promise<BrowserSession> {
  if (sessions.size >= config.maxSessions) {
    throw new HttpError(503, "CAPACITY_REACHED", "No browser slot is available right now");
  }
  if (sessions.has(input.guidanceSessionId)) {
    throw new HttpError(409, "SESSION_EXISTS", "This guidance session already has a browser");
  }
  const url = navigationUrl(input.targetUrl);
  const context = await browser().then((instance) =>
    instance.newContext({
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
      acceptDownloads: false,
      serviceWorkers: "block",
      ignoreHTTPSErrors: false,
    }),
  );
  const page = await context.newPage();
  try {
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (error) {
    await context.close().catch(() => undefined);
    throw new HttpError(
      502,
      "NAVIGATION_FAILED",
      error instanceof Error ? error.message : "The employer page could not be opened",
    );
  }

  const session = new BrowserSession({
    id: input.guidanceSessionId,
    applicationId: input.applicationId,
    guidanceSessionId: input.guidanceSessionId,
    targetUrl: url.toString(),
    context,
    page,
  });
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): BrowserSession {
  const session = sessions.get(id);
  if (!session) throw new HttpError(404, "SESSION_NOT_FOUND", "Browser session not found");
  session.touch();
  return session;
}

export async function deleteSession(id: string): Promise<boolean> {
  const session = sessions.get(id);
  if (!session) return false;
  sessions.delete(id);
  await session.close();
  return true;
}

const cleanup = setInterval(() => {
  for (const session of sessions.values()) {
    if (session.idleMs > config.sessionTtlMs) {
      void deleteSession(session.id);
    }
  }
}, Math.min(60_000, config.sessionTtlMs));
cleanup.unref();

export async function shutdown(): Promise<void> {
  clearInterval(cleanup);
  await Promise.all([...sessions.keys()].map((id) => deleteSession(id)));
  if (browserPromise) {
    const instance = await browserPromise.catch(() => null);
    await instance?.close().catch(() => undefined);
    browserPromise = null;
  }
}
