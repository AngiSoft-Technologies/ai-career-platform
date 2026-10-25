import { lookup } from "node:dns/promises";
import net from "node:net";

const PRIVATE_V4 = [
  { min: "10.0.0.0", max: "10.255.255.255" },
  { min: "172.16.0.0", max: "172.31.255.255" },
  { min: "192.168.0.0", max: "192.168.255.255" },
  { min: "127.0.0.0", max: "127.255.255.255" },
  { min: "169.254.0.0", max: "169.254.255.255" },
  { min: "0.0.0.0", max: "0.255.255.255" },
  { min: "100.64.0.0", max: "100.127.255.255" },
];

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

function ipv4ToNumber(value: string): number {
  return value
    .split(".")
    .reduce((total, part) => (total << 8) + Number(part), 0) >>> 0;
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  return PRIVATE_V4.some(
    (range) =>
      value >= ipv4ToNumber(range.min) && value <= ipv4ToNumber(range.max),
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalised = (address.toLowerCase().split("%")[0] ?? "").trim();
  if (normalised === "::1" || normalised === "::") return true;
  if (normalised.startsWith("fe80") || normalised.startsWith("fc")) return true;
  if (normalised.startsWith("::ffff:")) {
    const mapped = normalised.slice("::ffff:".length);
    return net.isIPv4(mapped) ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (net.isIPv6(address)) return isPrivateIpv6(address);
  return false;
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("UNSUPPORTED_PROTOCOL");
  }

  if (url.username || url.password) {
    throw new BlockedUrlError("URL_CREDENTIALS_NOT_ALLOWED");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new BlockedUrlError("PRIVATE_ADDRESS");
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new BlockedUrlError("PRIVATE_ADDRESS");
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new BlockedUrlError("DNS_LOOKUP_FAILED");
  }

  if (addresses.length === 0) {
    throw new BlockedUrlError("DNS_LOOKUP_FAILED");
  }

  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      throw new BlockedUrlError("PRIVATE_ADDRESS");
    }
  }

  return url;
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeFetchResult {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
  durationMs: number;
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const url = await assertPublicUrl(rawUrl);
  const startedAt = Date.now();
  const maxBytes = options.maxBytes ?? 3_000_000;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "User-Agent":
        "JobRadarBot/1.0 (+https://www.angisoft.co.ke; job discovery bot)",
      Accept:
        "text/html,application/xhtml+xml,application/json,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(options.headers ?? {}),
    },
    body: options.body,
    redirect: "follow",
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (options.method === "HEAD") {
    return {
      status: response.status,
      contentType,
      body: "",
      finalUrl: response.url || url.toString(),
      durationMs: Date.now() - startedAt,
    };
  }

  const buffer = await response.arrayBuffer();
  const slice = buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;
  const body = new TextDecoder("utf-8", { fatal: false }).decode(slice);

  return {
    status: response.status,
    contentType,
    body,
    finalUrl: response.url || url.toString(),
    durationMs: Date.now() - startedAt,
  };
}
