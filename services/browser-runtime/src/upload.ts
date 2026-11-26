import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

const SIGNATURE_FRAGMENT = "#mboqara=";

export interface PdfUpload {
  buffer: Buffer;
  filename: string;
}

function assertPdf(buffer: Buffer): void {
  if (buffer.length > config.uploadMaxBytes) {
    throw new HttpError(413, "UPLOAD_TOO_LARGE", "The PDF is too large to upload");
  }
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new HttpError(400, "NOT_A_PDF", "The signed document was not a PDF");
  }
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return config.uploadAllowedHosts.some((entry) =>
    entry.startsWith(".") ? host.endsWith(entry) || host === entry.slice(1) : host === entry,
  );
}

function assertNavigationTarget(url: URL): void {
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new HttpError(400, "UNSAFE_UPLOAD_URL", "Only HTTP(S) PDF URLs are accepted");
  }
  if (url.username || url.password) {
    throw new HttpError(400, "UNSAFE_UPLOAD_URL", "Credentials in upload URLs are not accepted");
  }
  if (!hostAllowed(url.hostname)) {
    throw new HttpError(403, "UPLOAD_HOST_NOT_ALLOWED", "This PDF host is not allowlisted");
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Signed data URLs are used for PDFs exported through the authenticated web
 * proxy. The signature covers the document id, expiry and payload, so a caller
 * cannot swap the bytes or reuse the URL after it expires. No cookie or bearer
 * token travels with the URL.
 */
function decodeSignedDataUrl(url: string): PdfUpload {
  const prefix = "data:application/pdf;base64,";
  if (!url.startsWith(prefix)) {
    throw new HttpError(400, "UNSAFE_UPLOAD_URL", "Only signed PDF URLs are accepted");
  }
  const fragmentIndex = url.indexOf(SIGNATURE_FRAGMENT);
  if (fragmentIndex < prefix.length) {
    throw new HttpError(400, "UNSIGNED_UPLOAD_URL", "The PDF URL is missing its signature");
  }

  const payload = url.slice(prefix.length, fragmentIndex);
  const parts = url.slice(fragmentIndex + SIGNATURE_FRAGMENT.length).split(".");
  if (parts.length !== 3) {
    throw new HttpError(400, "UNSIGNED_UPLOAD_URL", "The PDF URL signature is malformed");
  }
  const [documentId, expiresRaw, signature] = parts;
  const expires = Number(expiresRaw);
  if (!documentId || !Number.isFinite(expires) || Date.now() > expires) {
    throw new HttpError(400, "UPLOAD_URL_EXPIRED", "The signed PDF URL has expired");
  }

  const expected = createHmac("sha256", config.uploadSecret)
    .update(`${documentId}.${expiresRaw}.${payload}`)
    .digest("hex");
  if (!safeEqual(signature, expected)) {
    throw new HttpError(403, "UPLOAD_SIGNATURE_INVALID", "The PDF URL signature is invalid");
  }

  const buffer = Buffer.from(payload, "base64");
  assertPdf(buffer);
  return { buffer, filename: `${documentId}.pdf` };
}

async function fetchAllowlistedPdf(url: string): Promise<PdfUpload> {
  let current = new URL(url);
  assertNavigationTarget(current);

  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { accept: "application/pdf" },
      signal: AbortSignal.timeout(15_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new HttpError(400, "UPLOAD_REDIRECT_INVALID", "Redirect without a location");
      }
      current = new URL(location, current);
      assertNavigationTarget(current);
      continue;
    }

    if (!response.ok) {
      throw new HttpError(502, "UPLOAD_FETCH_FAILED", `PDF host returned ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    assertPdf(buffer);
    const filename = decodeURIComponent(current.pathname.split("/").at(-1) || "document.pdf");
    return { buffer, filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf` };
  }

  throw new HttpError(400, "UPLOAD_REDIRECT_LIMIT", "Too many PDF redirects");
}

/** Resolves a caller-supplied PDF URL without trusting arbitrary hosts. */
export async function loadPdf(url: string): Promise<PdfUpload> {
  if (url.startsWith("data:")) return decodeSignedDataUrl(url);
  return fetchAllowlistedPdf(url);
}
