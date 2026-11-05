/**
 * Our own egress layer.
 *
 * Every scrape routes through this pool instead of a proprietary upstream
 * browser/TLS pool.
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
import { redactError, redactUrl } from "../../lib/redact.js";
import { assertPublicUrl } from "../../lib/net-guard.js";

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

/**
 * The user agents used for *search* requests.
 *
 * DuckDuckGo answers Chrome far more often with an "anomaly" page than
 * it answers Firefox or Safari: HTTP 202, a JavaScript challenge, and
 * not one result. The response is a successful fetch as far as the
 * transport is concerned, so the only way to notice is to read the body
 * — and the symptom we saw was a search agent that ran for an hour and
 * stored nothing at all, with no error to explain it.
 *
 * The general pool above is Chrome-heavy, which is right for the pages
 * we scrape and wrong for the engines we query. These three are the
 * ones the engines answer.
 */
const SEARCH_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!;
}

/**
 * A user agent for a search request.
 *
 * The index rotates: a retry after a block must not repeat the agent
 * that was blocked, or the retry is the same request again.
 */
export function searchUserAgent(index = 0): string {
  const agent =
    SEARCH_USER_AGENTS[
      (index + Math.floor(Math.random() * SEARCH_USER_AGENTS.length)) %
        SEARCH_USER_AGENTS.length
    ];
  return agent ?? SEARCH_USER_AGENTS[0]!;
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

/**
 * Headers for a search request.
 *
 * The same shape as `browserHeaders`, with the user agent an engine
 * will answer. An explicit `User-Agent` in `extra` still wins, so a
 * caller that knows what it wants can say so.
 */
export function searchHeaders(
  extra: Record<string, string> = {},
  index = 0,
): Record<string, string> {
  const headers = browserHeaders(extra);
  if (!extra["User-Agent"]) headers["User-Agent"] = searchUserAgent(index);
  return headers;
}

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

/** How many redirects we will follow before giving up. */
const MAX_REDIRECT_HOPS = 5;

/** One HTTP response, in the shape the redirect loop needs. */
interface HopResponse {
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  url: string;
}

/** Performs a single request, without following redirects. */
type PerformHop = (url: string, init: RequestInit) => Promise<HopResponse>;

/**
 * Follows redirects, checking every hop.
 *
 * `fetch` follows redirects on its own, and it does not check them: a
 * public URL can answer with a redirect to a private address — the
 * cloud metadata endpoint, say — and the request that follows goes
 * there unchecked. The same is true of the content policy: a redirect
 * is a way around a blocked host.
 *
 * So the redirects are followed here, one hop at a time, and each
 * destination goes through the network guard before it is requested.
 *
 * The guard runs with `onDnsFailure: "allow"`, the same as the scraper's
 * own entry check: a transient resolver hiccup must not be recorded as
 * a permanent refusal.
 */
async function fetchFollowingRedirects(
  perform: PerformHop,
  startUrl: string,
  init: RequestInit,
  via: string,
): Promise<EgressResponse> {
  let current = startUrl;
  let method = init.method ?? "GET";
  let body = init.body;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const response = await perform(current, {
      ...init,
      method,
      body,
      redirect: "manual",
    });

    const location = response.headers["location"];
    const isRedirect =
      response.status >= 300 && response.status < 400 && Boolean(location);

    if (!isRedirect) {
      return {
        status: response.status,
        headers: response.headers,
        body: response.body,
        finalUrl: response.url || current,
        via,
      };
    }

    if (hop === MAX_REDIRECT_HOPS) {
      throw new Error(`Too many redirects (${MAX_REDIRECT_HOPS})`);
    }

    let next: string;
    try {
      next = new URL(location ?? "", current).toString();
    } catch {
      throw new Error("Invalid redirect location");
    }

    // Every hop is checked: a redirect must not be a way around the
    // network guard or the content policy.
    const checked = await assertPublicUrl(next, { onDnsFailure: "allow" });
    current = checked.toString();

    // 303 always becomes GET; 301 and 302 do too when the method was
    // not GET or HEAD. 307 and 308 keep the method and the body.
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        method !== "GET" &&
        method !== "HEAD")
    ) {
      method = "GET";
      body = undefined;
    }
  }

  // The loop always returns or throws.
  throw new Error("Redirect loop ended unexpectedly");
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
      // The node URL can carry a shared secret in its path or query, and the
      // `via` field is stored on the scrape result — redact before it lands
      // anywhere durable.
      via: `node:${redactUrl(node.url)}`,
    };
  } catch (error) {
    recordFailure(node.health);
    logger.debug(
      { error: redactError(error), node: redactUrl(node.url) },
      "Egress node failed",
    );
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
  // One timeout for the whole chain, not one per hop: five hops of
  // twenty seconds each is a hundred seconds of a worker held up.
  const signal = init.signal ?? AbortSignal.timeout(20_000);
  try {
    const response = await fetchFollowingRedirects(
      async (hopUrl, hopInit): Promise<HopResponse> => {
        const hopResponse = await undiciFetch(hopUrl, {
          method: hopInit.method ?? "GET",
          headers: hopInit.headers as Record<string, string>,
          body: hopInit.body as string | undefined,
          dispatcher,
          signal,
          redirect: "manual",
        });
        const body = await hopResponse.arrayBuffer();
        return {
          status: hopResponse.status,
          headers: Object.fromEntries(hopResponse.headers.entries()),
          body,
          url: hopResponse.url,
        };
      },
      url,
      init,
      // A free proxy URL carries its credentials in the userinfo section.
      // `via` ends up on the scrape result and in the cache, so it must not
      // contain the password.
      `proxy:${redactUrl(proxy.url)}`,
    );
    recordSuccess(proxy.health);
    return response;
  } catch (error) {
    recordFailure(proxy.health);
    logger.debug(
      { error: redactError(error), proxy: redactUrl(proxy.url) },
      "Free proxy request failed",
    );
    return null;
  } finally {
    await dispatcher.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function directFetch(url: string, init: RequestInit): Promise<EgressResponse> {
  return fetchFollowingRedirects(
    async (hopUrl, hopInit): Promise<HopResponse> => {
      const hopResponse = await fetch(hopUrl, {
        ...hopInit,
        redirect: "manual",
        signal: hopInit.signal ?? AbortSignal.timeout(25_000),
      });
      const body = await hopResponse.arrayBuffer();
      return {
        status: hopResponse.status,
        headers: Object.fromEntries(hopResponse.headers.entries()),
        body,
        url: hopResponse.url,
      };
    },
    url,
    init,
    "direct",
  );
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
