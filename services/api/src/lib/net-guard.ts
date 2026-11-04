/**
 * Network guard — one SSRF implementation for every outbound request.
 *
 * There used to be two: one in the scrape engine and one for source
 * connectors. They disagreed about DNS failures and about which hostnames are
 * private, which meant the stricter one only protected whichever code path
 * happened to call it. This module is the single answer.
 *
 * The rules, in order:
 *
 *   1. http/https only. `file:`, `gopher:`, `data:` are never fetchable.
 *   2. No embedded credentials. A URL with `user:pass@` leaks into logs and
 *      proxies, and legitimate callers pass credentials as headers.
 *   3. Loopback, link-local (cloud metadata lives at 169.254.169.254), RFC1918,
 *      CGNAT, and their IPv6 equivalents are refused.
 *   4. The hostname is **resolved and every answer checked**, so a DNS name
 *      pointing at a private address is refused. This also catches the classic
 *      `localtest.me`-style bypass.
 *
 * Limits of what a synchronous check can do: fetch re-resolves the name, so a
 * hostile DNS server can return a public address here and a private one at
 * connect time (DNS rebinding). Closing that hole needs an IP-pinned
 * dispatcher. What this module *does* guarantee is that a redirect to a private
 * address is re-checked per hop (see `safeFetch`), which is the realistic
 * attack against a connector that follows links from page content.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

const PRIVATE_V4 = [
  { min: "0.0.0.0", max: "0.255.255.255" },
  { min: "10.0.0.0", max: "10.255.255.255" },
  { min: "100.64.0.0", max: "100.127.255.255" },
  { min: "127.0.0.0", max: "127.255.255.255" },
  { min: "169.254.0.0", max: "169.254.255.255" },
  { min: "172.16.0.0", max: "172.31.255.255" },
  { min: "192.0.0.0", max: "192.0.0.255" },
  { min: "192.168.0.0", max: "192.168.255.255" },
  { min: "198.18.0.0", max: "198.19.255.255" },
  { min: "224.0.0.0", max: "239.255.255.255" },
  { min: "240.0.0.0", max: "255.255.255.255" },
];

export type BlockedUrlReason =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "URL_CREDENTIALS_NOT_ALLOWED"
  | "PRIVATE_ADDRESS"
  | "PRIVATE_HOSTNAME"
  | "DNS_LOOKUP_FAILED"
  /** The target's robots.txt disallows this path for our user agent. */
  | "ROBOTS_DISALLOWED";

export class BlockedUrlError extends Error {
  constructor(readonly reason: BlockedUrlReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
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
  // fc00::/7 (unique local) and fe80::/10 (link local).
  if (/^f[cd]/.test(normalised)) return true;
  if (normalised.startsWith("fe8") || normalised.startsWith("fe9") ||
      normalised.startsWith("fea") || normalised.startsWith("feb")) {
    return true;
  }
  // IPv4-mapped IPv6: check the embedded address, and treat an unparseable
  // mapping as private rather than guessing.
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

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\.google\.internal$/i,
];

export interface AssertPublicUrlOptions {
  /**
   * What a failed DNS lookup means. `throw` (default) treats it as a blocked
   * URL — right for connectors, where an unresolvable host is a bad source.
   * `allow` lets the caller surface a normal network error instead — right for
   * the scraper, where a transient resolver hiccup must not be recorded as a
   * permanent block.
   */
  onDnsFailure?: "throw" | "allow";
}

export async function assertPublicUrl(
  rawUrl: string,
  options: AssertPublicUrlOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("UNSUPPORTED_PROTOCOL", url.protocol);
  }

  if (url.username || url.password) {
    throw new BlockedUrlError("URL_CREDENTIALS_NOT_ALLOWED");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new BlockedUrlError("PRIVATE_HOSTNAME", hostname);
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new BlockedUrlError("PRIVATE_ADDRESS", hostname);
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    if (options.onDnsFailure === "allow") return url;
    throw new BlockedUrlError("DNS_LOOKUP_FAILED", hostname);
  }

  if (addresses.length === 0) {
    if (options.onDnsFailure === "allow") return url;
    throw new BlockedUrlError("DNS_LOOKUP_FAILED", hostname);
  }

  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      throw new BlockedUrlError("PRIVATE_ADDRESS", hostname);
    }
  }

  return url;
}
