/**
 * Search query operators — planning, local enforcement, position integrity.
 *
 * Free search backends are inconsistent about operator support: most honour
 * `site:`, many silently drop `inurl:`/`intitle:` when combined with it, and
 * some mis-parse a parenthesised `(site:a OR site:b)` group, leaking
 * off-domain results. So we split the query:
 *
 *   - the **provider query** keeps only what backends reliably support,
 *   - everything they dropped is **enforced locally** against the returned
 *     URLs and titles,
 *   - every filter step **renumbers `position`** so client-facing indexes
 *     match persisted analytics exactly.
 *
 * Category filters and include/exclude domains are baked into the provider
 * query as *bare* `site:` groups (unparenthesised — see `buildDomainQuery`).
 */

import { domainToASCII } from "node:url";

export type SearchCategory = "github" | "research" | "pdf" | "developer" | "gov";

export interface QueryPlan {
  /** What we actually send to the provider. */
  providerQuery: string;
  /** Sites the query restricted to (empty = unconstrained). */
  siteDomains: string[];
  /** Sites the query excluded. */
  excludedSites: string[];
  /** `inurl:` terms, enforced locally. */
  inUrl: string[];
  /** `intitle:` terms, enforced locally. */
  inTitle: string[];
  /** True when operators were stripped from the provider query and must be
   *  enforced locally, which also means we should over-fetch more. */
  relaxed: boolean;
}

const SITE_RE = /(^|\s)site:(\S+)/gi;
const NEG_SITE_RE = /(^|\s)-site:(\S+)/gi;
const INURL_RE = /(^|\s)inurl:(\S+)/gi;
const INTITLE_RE = /(^|\s)intitle:(\S+)/gi;
const OR_RE = /(^|\s)OR(\s|$)/i;

/** Normalises a site operand to an ASCII registrable-ish host, keeping any path. */
export function normalizeSite(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\/+$/, "");
  if (!trimmed) return "";
  const slash = trimmed.indexOf("/");
  const host = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const rest = slash === -1 ? "" : trimmed.slice(slash);
  const asciiHost = domainToASCII(host) || host;
  return `${asciiHost}${rest}`;
}

function collect(value: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const match of value.matchAll(re)) {
    const captured = match[2];
    if (captured) out.push(captured.trim());
  }
  return out;
}

/**
 * True when `OR` joins terms that are not all `site:` — backends handle that
 * combination unreliably, so the query is passed through untouched rather
 * than half-honoured.
 */
function hasUnsupportedOr(query: string): boolean {
  if (!OR_RE.test(query)) return false;
  const parts = query.split(/\s+OR\s+/i).map((part) => part.trim());
  return !parts.every((part) => /^site:\S+$/i.test(part));
}

/**
 * Plans a query into provider query + locally-enforced operators.
 *
 * `inurl:`/`intitle:` are stripped from the provider query whenever they are
 * combined with `site:` (the unreliable combination) and flagged for local
 * enforcement.
 */
export function planOperatorQuery(query: string): QueryPlan {
  const siteDomains = collect(query, SITE_RE).map(normalizeSite).filter(Boolean);
  const excludedSites = collect(query, NEG_SITE_RE).map(normalizeSite).filter(Boolean);

  let inUrl = collect(query, INURL_RE);
  let inTitle = collect(query, INTITLE_RE);

  let providerQuery = query;
  let relaxed = false;

  const stripLocals =
    siteDomains.length > 0 && (inUrl.length > 0 || inTitle.length > 0);

  if (stripLocals) {
    providerQuery = providerQuery
      .replace(INURL_RE, " ")
      .replace(INTITLE_RE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    relaxed = true;
  } else {
    // Without a site: term the operators are usually supported; keep them so
    // the backend can restrict before we ever see results.
    inUrl = [];
    inTitle = [];
  }

  if (hasUnsupportedOr(query)) {
    providerQuery = query;
    relaxed = true;
  }

  return {
    providerQuery,
    siteDomains,
    excludedSites,
    inUrl,
    inTitle,
    relaxed,
  };
}

export interface OperatorMatchTarget {
  url: string;
  title?: string;
}

function hostMatchesSite(host: string, site: string): boolean {
  const siteHost = site.split("/")[0] ?? site;
  if (!siteHost) return false;
  if (host === siteHost) return true;
  if (host.endsWith(`.${siteHost}`)) return true;
  // A site: operand with a path restricts to that path prefix.
  const sitePath = site.includes("/") ? site.slice(site.indexOf("/")) : "";
  if (sitePath) {
    try {
      const path = new URL(`https://${host}`).pathname;
      return host.endsWith(`.${siteHost}`) || host === siteHost
        ? path.startsWith(sitePath) || sitePath.startsWith(path)
        : false;
    } catch {
      return false;
    }
  }
  return false;
}

/** Local enforcement of the operators that were stripped from `providerQuery`. */
export function matchesQueryOperators(
  item: OperatorMatchTarget,
  plan: QueryPlan,
): boolean {
  if (plan.excludedSites.length > 0) {
    let host: string;
    try {
      host = new URL(item.url).hostname.toLowerCase();
    } catch {
      return false;
    }
    for (const excluded of plan.excludedSites) {
      if (hostMatchesSite(host, excluded)) return false;
    }
  }

  const url = item.url.toLowerCase();
  const decoded = safeDecode(url);

  for (const term of plan.inUrl) {
    if (!url.includes(term.toLowerCase()) && !decoded.includes(term.toLowerCase())) {
      return false;
    }
  }

  const title = (item.title ?? "").toLowerCase();
  for (const term of plan.inTitle) {
    if (!title.includes(term.toLowerCase())) return false;
  }

  if (plan.siteDomains.length > 0) {
    let host: string;
    try {
      host = new URL(item.url).hostname.toLowerCase();
    } catch {
      return false;
    }
    if (!plan.siteDomains.some((site) => hostMatchesSite(host, site))) {
      return false;
    }
  }

  return true;
}

/**
 * Local enforcement of include/exclude domain lists. Backends drop these
 * filters silently and often, so they are re-checked client-side even when
 * they were sent in the provider query.
 *
 * The two directions are deliberately asymmetric:
 *
 *  - **include** uses exact + subdomain matching. A false positive here would
 *    silently discard a legitimate result, so it must be strict.
 *  - **exclude** additionally matches *other TLDs of the same base domain*
 *    (`facebook.com` also blocks `facebook.co.uk`). Approximated by comparing
 *    the leading label, because a public-suffix list would be needed to be
 *    exact — and over-blocking an exclusion list is the safe direction.
 */
export function matchesDomainLists(
  url: string,
  includeDomains: string[] = [],
  excludeDomains: string[] = [],
): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  const exactOrSubdomain = (domains: string[]): boolean =>
    domains.some((domain) => {
      const normalised = normalizeSite(domain).split("/")[0] ?? "";
      return host === normalised || host.endsWith(`.${normalised}`);
    });

  const sameBaseDomain = (domains: string[]): boolean => {
    const leading = host.split(".")[0];
    if (!leading) return false;
    return domains.some((domain) => {
      const normalised = normalizeSite(domain).split("/")[0] ?? "";
      const domainLeading = normalised.split(".")[0] ?? "";
      return domainLeading.length > 0 && domainLeading === leading;
    });
  };

  if (includeDomains.length > 0 && !exactOrSubdomain(includeDomains)) return false;
  if (excludeDomains.length > 0 && (exactOrSubdomain(excludeDomains) || sameBaseDomain(excludeDomains))) {
    return false;
  }
  return true;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Filters by operators and **renumbers positions** only when something was
 * dropped — an untouched list keeps its provider order and numbering.
 */
export function keepOperatorMatches<
  T extends OperatorMatchTarget & { position?: number },
>(items: T[], plan: QueryPlan): { items: T[]; dropped: number } {
  if (
    plan.siteDomains.length === 0 &&
    plan.excludedSites.length === 0 &&
    plan.inUrl.length === 0 &&
    plan.inTitle.length === 0
  ) {
    return { items, dropped: 0 };
  }

  const kept = items.filter((item) => matchesQueryOperators(item, plan));
  const dropped = items.length - kept.length;
  if (dropped === 0) return { items: kept, dropped: 0 };

  return {
    items: kept.map((item, index) => ({ ...item, position: index + 1 })),
    dropped,
  };
}

// ---------------------------------------------------------------------------
// Category / domain query construction
// ---------------------------------------------------------------------------

const CATEGORY_DOMAINS: Partial<Record<SearchCategory, string[]>> = {
  github: ["github.com"],
  research: [
    "arxiv.org",
    "scholar.google.com",
    "semanticscholar.org",
    "pubmed.ncbi.nlm.nih.gov",
    "researchgate.net",
    "ssrn.com",
    "acm.org",
    "ieee.org",
    "springer.com",
    "nature.com",
    "sciencedirect.com",
    "jstor.org",
    "biorxiv.org",
    "ncbi.nlm.nih.gov",
  ],
};

export interface CategoryQuery {
  query: string;
  /** Map of domain → category, so results can be attributed after filtering. */
  categoryMap: Map<string, SearchCategory>;
}

export function buildCategoryQuery(
  query: string,
  categories: SearchCategory[] = [],
): CategoryQuery {
  const categoryMap = new Map<string, SearchCategory>();
  const siteTerms: string[] = [];
  const fileTerms: string[] = [];

  for (const category of categories) {
    if (category === "pdf") {
      fileTerms.push("filetype:pdf");
      continue;
    }
    const domains = CATEGORY_DOMAINS[category];
    if (!domains) continue; // developer/gov run as exclusive indexes upstream
    for (const domain of domains) {
      siteTerms.push(`site:${domain}`);
      categoryMap.set(domain, category);
    }
  }

  return {
    query: [query.trim(), ...siteTerms, ...fileTerms].filter(Boolean).join(" "),
    categoryMap,
  };
}

/**
 * Domain filters as **bare** `site:` groups. Parenthesising is tempting but
 * several backends drop a parenthesised group entirely, which leaks
 * off-domain results — so we keep them flat.
 */
export function buildDomainQuery(
  query: string,
  includeDomains: string[] = [],
  excludeDomains: string[] = [],
): string {
  const include = includeDomains.map(normalizeSite).filter(Boolean);
  const exclude = excludeDomains.map(normalizeSite).filter(Boolean);
  return [
    query.trim(),
    ...include.map((domain) => `site:${domain}`),
    ...exclude.map((domain) => `-site:${domain}`),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Category attribution for a result URL, used for analytics and feedback. */
export function getCategoryFromUrl(
  url: string,
  categoryMap: Map<string, SearchCategory>,
): SearchCategory | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/\.pdf$/i.test(new URL(url).pathname)) return "pdf";
  for (const [domain, category] of categoryMap) {
    if (host === domain || host.endsWith(`.${domain}`)) return category;
  }
  return null;
}
