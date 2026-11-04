/**
 * Search-engine redirect wrappers.
 *
 * Every major engine hides the real destination behind a redirect URL so it
 * can count the click:
 *
 *   DuckDuckGo  https://duckduckgo.com/l/?uddg=<percent-encoded url>
 *   Bing         https://www.bing.com/ck/a?...&u=a1<base64url url>
 *
 * The wrappers are useless to us — and worse than useless when they reach
 * the crawler: Bing's wrapper is a redirect *page*, not a redirect, so
 * fetching it returns a page that says "redirecting" rather than the job
 * posting. The browse agent then reports the page as unreadable and the
 * listing is lost.
 *
 * So the wrappers are decoded at the source, before a result is ever
 * queued, and anything that cannot be decoded is dropped.
 */

/** True when the URL is a Bing click-through wrapper. */
export function isBingRedirectWrapper(url: string): boolean {
  return url.includes("bing.com/ck/");
}

/**
 * Decodes the destination of a search-engine redirect wrapper.
 *
 * Returns the original URL when it is not a wrapper or cannot be decoded —
 * the caller decides whether an undecipherable wrapper is worth keeping.
 */
export function unwrapSearchRedirect(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  // DuckDuckGo: the destination is a query parameter.
  if (rawUrl.includes("duckduckgo.com/l/") || rawUrl.includes("uddg=")) {
    try {
      const url = new URL(rawUrl, "https://duckduckgo.com");
      const target = url.searchParams.get("uddg");
      if (target) {
        const decoded = decodeURIComponent(target);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    } catch {
      // Fall through to the original URL.
    }
    return rawUrl;
  }

  // Bing: the destination is base64url after the `a1` marker.
  if (isBingRedirectWrapper(rawUrl)) {
    try {
      const url = new URL(rawUrl);
      const payload = url.searchParams.get("u");
      if (!payload || !payload.startsWith("a1")) return rawUrl;
      const decoded = decodeBase64Url(payload.slice(2));
      if (/^https?:\/\//i.test(decoded)) return decoded;
    } catch {
      // Fall through to the original URL.
    }
    return rawUrl;
  }

  return rawUrl;
}

/**
 * True when the URL is a wrapper we could not read.
 *
 * These are never worth crawling: the page behind them is a redirect
 * notice, not content.
 */
export function isUnreadableRedirectWrapper(url: string): boolean {
  if (!url) return true;
  if (isBingRedirectWrapper(url)) return true;
  if (url.includes("duckduckgo.com/l/") && url.includes("uddg=")) return true;
  return false;
}

function decodeBase64Url(value: string): string {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}
