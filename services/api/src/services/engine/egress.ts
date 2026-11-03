/**
 * Our own egress layer.
 *
 * ACE routes every scrape through its proprietary "fire-engine" pool.
 * We cannot buy that, so we build the same idea from free parts we already
 * own:
 *
 *   1. Direct egress from the Fly Machine running the worker.
 *   2. Our own multi-region egress nodes: any API Machine can act as an
 *      egress proxy through the internal-only `/internal/egress` endpoint.
 *      That gives us several source IPs in several countries for free.
 *   3. A self-built free-proxy pool: public lists are fetched, every proxy is
 *      validated against a real HTTPS endpoint, scored, and rotated. No paid
 *      provider, no vendor.
 *
 * Selection is health-based: failing nodes are cooled down and skipped.
 */

import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { logger } from "../../logger.js";

export interface EgressResponse {
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  finalUrl: string;
  via: string;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!;
}

export function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": randomUserAgent(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Health tracking
// ---------------------------------------------------------------------------

interface Health {
  successes: number;
  failures: number;
  cooldownUntil: number;
}

function newHealth(): Health {
  return { successes: 0, failures: 0, cooldownUntil: 0 };
}

function isHealthy(health: Health): boolean {
  return Date.now() >= health.cooldownUntil;
}

function score(health: Health): number {
  const total = health.successes + health.failures;
  if (total === 0) return 1;
  return health.successes / total;
}

function recordSuccess(health: Health): void {
  health.successes += 1;
  health.cooldownUntil = 0;
}

function recordFailure(health: Health): void {
  health.failures += 1;
  const penalty = Math.min(15 * 60_000, 30_000 * 2 ** Math.min(health.failures, 5));
  health.cooldownUntil = Date.now() + penalty;
}

// ---------------------------------------------------------------------------
// Our own egress nodes (Fly Machines exposing /internal/egress)
// ---------------------------------------------------------------------------

interface EgressNode {
  url: string;
  health: Health;
}

function egressNodes(): EgressNode[] {
  const raw = process.env.EGRESS_NODES ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((url) => ({
      url: url.replace(/\/$/, ""),
      health: nodeHealth.get(url) ?? nodeHealth.set(url, newHealth()).get(url)!,
    }));
}

const nodeHealth = new Map<string, Health>();

interface EgressNodeResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  finalUrl?: string;
}

async function fetchViaNode(
  node: EgressNode,
  url: string,
  init: RequestInit,
): Promise<EgressResponse | null> {
  const token = process.env.EGRESS_TOKEN ?? "";
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${node.url}/internal/egress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-egress-token": token,
      },
      body: JSON.stringify({
        url,
        method: init.method ?? "GET",
        headers: init.headers,
        body: typeof init.body === "string" ? init.body : undefined,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      recordFailure(node.health);
      return null;
    }
    const payload = (await response.json()) as EgressNodeResponse;
    recordSuccess(node.health);
    return {
      status: payload.status,
      headers: payload.headers ?? {},
      body: payload.bodyBase64
        ? Uint8Array.from(Buffer.from(payload.bodyBase64, "base64")).buffer
        : new TextEncoder().encode(payload.body ?? "").buffer,
      finalUrl: payload.finalUrl ?? url,
      via: `node:${node.url}`,
    };
  } catch (error) {
    recordFailure(node.health);
    logger.debug({ error, node: node.url }, "Egress node failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickNode(): EgressNode | null {
  const healthy = egressNodes().filter((node) => isHealthy(node.health));
  if (healthy.length === 0) return null;
  healthy.sort((a, b) => score(b.health) - score(a.health));
  return healthy[0] ?? null;
}

// ---------------------------------------------------------------------------
// Free proxy pool (self-built, no provider)
// ---------------------------------------------------------------------------

const PROXY_LIST_URLS = [
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
];

interface FreeProxy {
  url: string;
  health: Health;
}

let proxyPool: FreeProxy[] = [];
let proxyRefreshAt = 0;
let proxyRefreshing: Promise<void> | null = null;

/**
 * The self-discovered free proxy pool is opt-in.
 *
 * Our own machines already give us several distinct egress IPs across Fly
 * regions, and public proxy lists are slow, mostly dead, and a liability for
 * a crawler that has to stay polite. It stays available for operators who want
 * it, but it is off by default so the common path is fast and predictable.
 */
function proxyEnabled(): boolean {
  return (process.env.FREE_PROXY_ENABLED ?? "false") === "true";
}

async function validateProxy(proxyUrl: string): Promise<boolean> {
  const agent = new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: true } });
  try {
    const response = await undiciFetch("https://api.ipify.org?format=json", {
      dispatcher: agent,
      signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": randomUserAgent() },
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { ip?: string };
    return Boolean(payload.ip);
  } catch {
    return false;
  } finally {
    await agent.close().catch(() => undefined);
  }
}

async function refreshProxyPool(): Promise<void> {
  if (!proxyEnabled()) return;
  if (proxyRefreshing) return proxyRefreshing;
  proxyRefreshAt = Date.now();

  proxyRefreshing = (async () => {
    const candidates = new Set<string>();
    for (const listUrl of PROXY_LIST_URLS) {
      try {
        const response = await fetch(listUrl, {
          signal: AbortSignal.timeout(12_000),
          headers: { "User-Agent": randomUserAgent() },
        });
        if (!response.ok) continue;
        const text = await response.text();
        for (const line of text.split("\n")) {
          const value = line.trim();
          if (/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(value)) {
            candidates.add(`http://${value}`);
          }
          if (candidates.size >= 60) break;
        }
      } catch {
        // A list being down must never break ingestion.
      }
    }

    const validated: FreeProxy[] = [];
    const batch = [...candidates].slice(0, 24);
    await Promise.all(
      batch.map(async (url) => {
        if (await validateProxy(url)) {
          validated.push({ url, health: newHealth() });
        }
      }),
    );

    if (validated.length > 0) {
      proxyPool = validated.slice(0, 12);
      logger.info({ count: proxyPool.length }, "Free proxy pool refreshed");
    } else {
      logger.warn("Free proxy pool refresh produced no healthy proxies");
    }
  })().finally(() => {
    proxyRefreshing = null;
  });

  return proxyRefreshing;
}

function pickProxy(): FreeProxy | null {
  if (!proxyEnabled()) return null;
  if (Date.now() - proxyRefreshAt > 30 * 60_000) {
    void refreshProxyPool();
  }
  const healthy = proxyPool.filter((proxy) => isHealthy(proxy.health));
  if (healthy.length === 0) return null;
  healthy.sort((a, b) => score(b.health) - score(a.health));
  return healthy[Math.floor(Math.random() * Math.min(3, healthy.length))] ?? null;
}

async function fetchViaProxy(
  proxy: FreeProxy,
  url: string,
  init: RequestInit,
): Promise<EgressResponse | null> {
  const dispatcher: Dispatcher = new ProxyAgent({
    uri: proxy.url,
    requestTls: { rejectUnauthorized: true },
  });
  try {
    const response = await undiciFetch(url, {
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
      dispatcher,
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    const body = await response.arrayBuffer();
    recordSuccess(proxy.health);
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      finalUrl: response.url,
      via: `proxy:${proxy.url}`,
    };
  } catch (error) {
    recordFailure(proxy.health);
    logger.debug({ error, proxy: proxy.url }, "Free proxy request failed");
    return null;
  } finally {
    await dispatcher.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function directFetch(url: string, init: RequestInit): Promise<EgressResponse> {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: init.signal ?? AbortSignal.timeout(25_000),
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.arrayBuffer(),
    finalUrl: response.url,
    via: "direct",
  };
}

/**
 * Fetch with automatic egress selection.
 *
 * `preferProxy` is used for sites that rate-limit datacenter IPs. We still
 * fall back to direct so a dead pool never stops the pipeline.
 */
export async function egressFetch(
  url: string,
  init: RequestInit = {},
  options: { preferProxy?: boolean } = {},
): Promise<EgressResponse> {
  const node = pickNode();
  if (node) {
    const viaNode = await fetchViaNode(node, url, init);
    if (viaNode) return viaNode;
  }

  if (options.preferProxy) {
    const proxy = pickProxy();
    if (proxy) {
      const viaProxy = await fetchViaProxy(proxy, url, init);
      if (viaProxy) return viaProxy;
    }
  }

  return directFetch(url, init);
}

export function egressStatus(): {
  nodes: number;
  proxies: number;
  proxyEnabled: boolean;
} {
  return {
    nodes: egressNodes().filter((node) => isHealthy(node.health)).length,
    proxies: proxyPool.filter((proxy) => isHealthy(proxy.health)).length,
    proxyEnabled: proxyEnabled(),
  };
}
