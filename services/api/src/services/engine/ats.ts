/**
 * The address of a hiring board.
 *
 * A board is the employer's whole list of postings, and it is addressed
 * rather than named: "jobs.lever.co/weloglobal", "eoin.fa.em3.
 * oraclecloud.com|CX_3001". The address is what a search engine finds
 * and what a careers page links to, so recognising it is the first
 * thing the pipeline does with any URL it has never seen.
 *
 * This module is deliberately small and free of imports beyond the
 * standard library: the search layer needs to recognise a board before
 * it decides whether a result is worth keeping, and it must not drag
 * the page fetcher in to do it.
 */

export type AtsKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "smartrecruiters"
  | "recruitee"
  | "workday"
  | "oracle"
  | "taleo"
  | "breezy";

export interface AtsBoard {
  kind: AtsKind;
  token: string;
}

const ATS_PATTERNS: Array<{
  kind: AtsKind;
  regex: RegExp;
  tokenIndex: number;
}> = [
  {
    kind: "greenhouse",
    // The host carries a region: "job-boards.eu.greenhouse.io" is
    // Jumia's board, and "boards.greenhouse.io" is the same vendor's
    // other one. The region is part of the address and not part of the
    // board, so it is read past.
    regex:
      /(?:[a-z0-9-]+\.)*(?:boards|job-boards)\.(?:[a-z0-9-]+\.)*greenhouse\.io\/([^/?#]+)/i,
    tokenIndex: 1,
  },
  {
    kind: "lever",
    regex: /jobs(?:\.[a-z0-9-]+)*\.lever\.co\/([^/?#]+)/i,
    tokenIndex: 1,
  },
  {
    kind: "ashby",
    regex: /jobs(?:\.[a-z0-9-]+)*\.ashbyhq\.com\/([^/?#]+)/i,
    tokenIndex: 1,
  },
  {
    kind: "workable",
    regex: /apply\.workable\.com\/([^/?#]+)/i,
    tokenIndex: 1,
  },
  {
    kind: "smartrecruiters",
    regex: /jobs(?:\.[a-z0-9-]+)*\.smartrecruiters\.com\/([^/?#]+)/i,
    tokenIndex: 1,
  },
  { kind: "recruitee", regex: /([a-z0-9-]+)\.recruitee\.com/i, tokenIndex: 1 },
];

/**
 * The paths that are not a board's own name.
 *
 * "boards.greenhouse.io/embed/job_board?for=jumia" is the board's own
 * embed script, and the board's name is not in it.
 */
const NOT_A_BOARD = new Set(["jobs", "api", "embed", "v1", "v0"]);

/**
 * Oracle's older board — Taleo.
 *
 * "britam.taleo.net/careersection/ke/jobsearch.ftl" is Britam's board,
 * and "equitybank.taleo.net/careersection/ext_new/jobsearch.ftl" is
 * Equity Bank's. The tenant is the employer and the environment is the
 * board's own name — "ke", "ext_new", "external - britam" — and both
 * are needed to reach it.
 */
function detectTaleo(rawUrl: string): AtsBoard | null {
  const match =
    /^https?:\/\/([a-z0-9-]+)\.taleo\.net\/careersection\/([^/?#]+)/i.exec(
      rawUrl,
    );
  if (!match?.[1] || !match[2]) return null;
  return { kind: "taleo", token: `${match[1]}|${decodeURIComponent(match[2])}` };
}

/**
 * Breezy's board.
 *
 * The employer's board is the employer's own sub-domain:
 * "cellulant-group.breezy.hr". The board's own address holds no name
 * beyond that, and the list is served as JSON at the same address with
 * "/json" on the end.
 */
function detectBreezy(rawUrl: string): AtsBoard | null {
  const match = /^https?:\/\/([a-z0-9-]+)\.breezy\.hr(?![a-z0-9-])/i.exec(
    rawUrl,
  );
  if (!match?.[1]) return null;
  return { kind: "breezy", token: match[1] };
}

/**
 * The Workday board behind a URL, if the URL names one.
 *
 * A Workday address is one of three shapes:
 *
 *   .../{locale}/{site}/job/...   a board, and the site is named
 *   .../{locale}/job/...          a board whose site is implicit
 *   .../job/{location}/{title}    a *posting*, not a board
 *
 * The third shape used to be read as a board called "job", and the
 * catalogue then held a board that could only ever answer 404: the
 * site's own name is nowhere in the address, and the endpoint that
 * serves the postings is addressed by that name.
 *
 * So a posting's address names the *tenant* and not the site, and the
 * board is found by asking the tenant which sites it publishes under.
 */
function detectWorkday(rawUrl: string): AtsBoard | null {
  // https://{tenant}.wd{n}.myworkdayjobs.com/{locale}/{site}/job/...
  const match =
    /^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com(\/[^?#]*)?/i.exec(
      rawUrl,
    );
  if (!match?.[1] || !match[2]) return null;

  const segments = (match[3] ?? "")
    .split("/")
    .filter((segment) => segment.length > 0);
  const first = segments[0] ?? "";

  if (first.toLowerCase() === "wday") return null;

  // A locale first, then the site.
  const isLocale = /^[a-z]{2}-[A-Z]{2}$/i.test(first);
  const site = isLocale ? (segments[1] ?? "") : first;

  // The posting's own path: the site's name is not in the address, and
  // it is asked for rather than guessed.
  const known = site.toLowerCase() === "job" ? "" : site;

  return { kind: "workday", token: `${match[1]}|${match[2]}|${known}` };
}

function detectOracle(rawUrl: string): AtsBoard | null {
  // https://{host}/hcmUI/CandidateExperience/{lang}/sites/{site}/...
  const match =
    /^https?:\/\/([^/]+)\/hcmUI\/CandidateExperience\/[^/]+\/sites\/([^/?#]+)/i.exec(
      rawUrl,
    );
  if (!match?.[1] || !match[2]) return null;
  return { kind: "oracle", token: `${match[1]}|${match[2]}` };
}

/**
 * The board behind an address, if the address names one.
 */
export function detectAts(rawUrl: string): AtsBoard | null {
  for (const pattern of ATS_PATTERNS) {
    const match = pattern.regex.exec(rawUrl);
    const token = match?.[pattern.tokenIndex];
    if (token && !NOT_A_BOARD.has(token.toLowerCase())) {
      return { kind: pattern.kind, token };
    }
  }
  return (
    detectWorkday(rawUrl) ??
    detectOracle(rawUrl) ??
    detectTaleo(rawUrl) ??
    detectBreezy(rawUrl)
  );
}

/**
 * The name a board is remembered under.
 *
 * It is the kind and the token together: two boards can share a token
 * ("rws" on Lever and "rws" on Ashby are different employers' boards),
 * and one board can be addressed in more than one way.
 */
export function boardKey(board: AtsBoard): string {
  return `${board.kind}:${board.token}`;
}
