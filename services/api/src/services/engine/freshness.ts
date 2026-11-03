/**
 * Freshness, change detection, and staleness.
 *
 * A job board that always shows the same three listings is worthless. This
 * module is how we *prove* a page changed and decide what the change means:
 *
 *   • `createMarkdownChangeDiff`  — a real unified diff plus a structured
 *                                   form, so we can count adds/removes and
 *                                   judge whether a job listing disappeared
 *   • `judgeListingChange`        — decides: ADDED / REMOVED / DESC_CHANGED /
 *                                   NO_CHANGE, using the diff instead of a
 *                                   fuzzy text comparison
 *   • staleness policy            — a repeated "no change" ladder that
 *                                   progressively backs a source off instead
 *                                   of hammering it, and a dead-source flag
 *                                   so a site that never changes stops costing
 *                                   us crawls
 *   • index reuse                 — the `maxAge` rule from the scrape engine:
 *                                   reuse an indexed page unless the read is
 *                                   freshness-critical
 */

import { createTwoFilesPatch } from "diff";
import parseDiff from "parse-diff";
import { contentHash } from "./index.js";
import { logger } from "../../logger.js";

export type ListingChange =
  | "added"
  | "removed"
  | "description_changed"
  | "no_change";

export interface MarkdownDiff {
  text: string;
  additions: number;
  removals: number;
  chunks: number;
}

export function createMarkdownChangeDiff(
  previousMarkdown: string,
  currentMarkdown: string,
  context = 3,
): MarkdownDiff | null {
  const text = createTwoFilesPatch(
    "previous.md",
    "current.md",
    previousMarkdown,
    currentMarkdown,
    "",
    "",
    { context },
  );

  const parsed = parseDiff(text);
  let additions = 0;
  let removals = 0;
  let chunks = 0;

  for (const file of parsed) {
    for (const chunk of file.chunks) {
      chunks += 1;
      for (const change of chunk.changes) {
        if (change.type === "add") additions += 1;
        if (change.type === "del") removals += 1;
      }
    }
  }

  if (additions === 0 && removals === 0) return null;
  return { text, additions, removals, chunks };
}

export interface ListingJudgement {
  change: ListingChange;
  additions: number;
  removals: number;
  /** True when the listing itself vanished rather than the page being edited. */
  listingRemoved: boolean;
  confidence: number;
}

/**
 * Judges what happened between two reads of the *same* job URL.
 *
 * We do not guess from a similarity score: we look at what the diff actually
 * removed. Removing the apply link, the requirements block, or most of the
 * body is a closed vacancy; a few added lines is usually an updated deadline.
 */
export function judgeListingChange(input: {
  previousMarkdown: string;
  currentMarkdown: string;
  previousTitle?: string;
  currentTitle?: string;
  previousApplyUrl?: string;
  currentApplyUrl?: string;
}): ListingJudgement {
  const previous = input.previousMarkdown;
  const current = input.currentMarkdown;

  if (previous === current) {
    return {
      change: "no_change",
      additions: 0,
      removals: 0,
      listingRemoved: false,
      confidence: 1,
    };
  }

  const diff = createMarkdownChangeDiff(previous, current);
  if (!diff) {
    return {
      change: "no_change",
      additions: 0,
      removals: 0,
      listingRemoved: false,
      confidence: 0.9,
    };
  }

  const previousLength = Math.max(previous.length, 1);
  const removalRatio = diff.removals / previousLength;

  // The strongest signal: the apply target is gone or the page 404s into a shell.
  const applyLinkGone =
    input.previousApplyUrl !== undefined &&
    input.currentApplyUrl !== undefined &&
    input.previousApplyUrl !== input.currentApplyUrl;

  const titleGone =
    input.previousTitle !== undefined &&
    input.currentTitle !== undefined &&
    input.currentTitle.length === 0;

  const emptyNow = current.trim().length < 80;

  if (emptyNow || (removalRatio > 0.7 && diff.additions < 5) || applyLinkGone || titleGone) {
    return {
      change: "removed",
      additions: diff.additions,
      removals: diff.removals,
      listingRemoved: true,
      confidence: applyLinkGone || titleGone ? 0.9 : 0.75,
    };
  }

  if (diff.additions > diff.removals) {
    return {
      change: "description_changed",
      additions: diff.additions,
      removals: diff.removals,
      listingRemoved: false,
      confidence: 0.8,
    };
  }

  return {
    change: "description_changed",
    additions: diff.additions,
    removals: diff.removals,
    listingRemoved: removalRatio > 0.5,
    confidence: 0.7,
  };
}

// ---------------------------------------------------------------------------
// Staleness policy
// ---------------------------------------------------------------------------

export interface StalenessState {
  /** Consecutive reads that reported no change. */
  unchangedReads: number;
  lastCheckedAt: Date | null;
  backoffMinutes: number;
  /** Set when a source stops being worth crawling at all. */
  exhausted: boolean;
}

export const STALE_NO_CHANGE_LIMIT = 6;
export const BASE_CHECK_INTERVAL_MINUTES = 30;
export const MAX_BACKOFF_MINUTES = 60 * 24 * 7;

/**
 * Progressive backoff. A source that never changes gets visited less and less
 * until it is marked exhausted, which is what keeps a 4,000-row catalogue from
 * re-reading the same dead board every cycle.
 */
export function advanceStaleness(
  state: StalenessState,
  changed: boolean,
  now: Date = new Date(),
): StalenessState {
  if (changed) {
    return {
      unchangedReads: 0,
      lastCheckedAt: now,
      backoffMinutes: BASE_CHECK_INTERVAL_MINUTES,
      exhausted: false,
    };
  }

  const unchangedReads = state.unchangedReads + 1;
  const doubled = Math.min(
    MAX_BACKOFF_MINUTES,
    BASE_CHECK_INTERVAL_MINUTES * 2 ** Math.max(0, unchangedReads - 1),
  );

  return {
    unchangedReads,
    lastCheckedAt: now,
    backoffMinutes: doubled,
    exhausted: unchangedReads >= STALE_NO_CHANGE_LIMIT,
  };
}

export function isDue(state: StalenessState, now: Date = new Date()): boolean {
  if (state.exhausted) return false;
  if (!state.lastCheckedAt) return true;
  const elapsedMinutes =
    (now.getTime() - state.lastCheckedAt.getTime()) / 60_000;
  return elapsedMinutes >= state.backoffMinutes;
}

/**
 * Index reuse rule, ported from the scrape engine's `maxAge` contract: a page
 * we already indexed can be reused, but a read that exists to detect *new*
 * jobs must bypass the cache.
 */
export function shouldReuseIndexed(
  indexedAt: Date | null,
  maxAgeMs: number,
  now: Date = new Date(),
): boolean {
  if (!indexedAt) return false;
  if (maxAgeMs <= 0) return false;
  const age = now.getTime() - indexedAt.getTime();
  return age <= maxAgeMs;
}

/** True when a page's content is "job rich" enough to be worth keeping. */
export function looksLikeJobContent(markdown: string): boolean {
  const lower = markdown.toLowerCase();
  const signals = [
    "apply",
    "requirements",
    "qualifications",
    "responsibilities",
    "job description",
    "we are hiring",
    "deadline",
    "salary",
    "vacancy",
  ];
  let hits = 0;
  for (const signal of signals) {
    if (lower.includes(signal)) hits += 1;
  }
  return hits >= 2 || markdown.length > 1_200;
}

/** Detects whether a page still advertises vacancies at all. */
export function pageStillHiring(markdown: string): boolean {
  return /(apply|hiring|vacanc|open(ing| position)|submit (your )?application)/i.test(
    markdown,
  );
}

/** Cheap dedupe helper used before promotion. */
export function isDuplicateMarkdown(a: string, b: string): boolean {
  if (a === b) return true;
  return contentHash(a) === contentHash(b);
}

export function logFreshness(
  identifier: string,
  change: ListingChange,
  detail: { additions: number; removals: number },
): void {
  logger.debug({ identifier, change, ...detail }, "Listing freshness check");
}
