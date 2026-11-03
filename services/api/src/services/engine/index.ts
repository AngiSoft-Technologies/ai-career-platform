/**
 * Front-tier index and crawl cache.
 *
 * This is the layer that makes repeated discovery cheap. Firecrawl's index
 * doubles as (a) a content-addressed cache that avoids re-fetching a page we
 * have already read, and (b) a search index that lets a crawler ask "have we
 * seen any jobs on this domain?" without scanning the whole corpus.
 *
 * Ours is built on what we already run — Postgres — with a Redis-style
 * in-process LRU in front of it so hot hosts never touch the database.
 *
 * Design:
 *   • `index_entries` keyed by content hash → stores URL, status, mime,
 *     title, markdown fingerprint, and a discovery timestamp
 *   • in-process LRU with TTL for markdown bodies (bounded to keep Fly's
 *     memory flat) and a longer-TTLLRU for *negative* results (404/robots
 *     denials) so we do not re-ask for a dead URL
 *   • `index_domains` counts per domain so the frontier can rank hosts we
 *     have historically had success on
 */

import { query } from "../../db/pool.js";
import { createHash } from "node:crypto";
import { logger } from "../../logger.js";

export interface IndexEntry {
  url: string;
  fetchedAt: Date;
  status: number;
  contentType: string;
  title?: string;
  markdown: string;
  markdownHash: string;
  domain: string;
  depth: number;
}

// ---------------------------------------------------------------------------
// In-process layers
// ---------------------------------------------------------------------------

const MAX_MARKDOWN_ENTRIES = 2_000;
const MAX_NEGATIVE_ENTRIES = 20_000;

const markdownCache = new Map<string, IndexEntry>();
const negativeCache = new Set<string>();

function touch<T>(map: Map<string, T>, key: string, value: T, max: number): void {
  // Delete-then-set makes the Map an LRU: oldest insertion stays first.
  map.delete(key);
  map.set(key, value);
  if (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

export function contentHash(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex").slice(0, 32);
}

/** In-process markdown cache read. Bounded, so Fly memory stays flat. */
export function readIndexEntry(url: string): IndexEntry | null {
  const hit = markdownCache.get(url);
  if (!hit) return null;
  // Refresh LRU position.
  markdownCache.delete(url);
  markdownCache.set(url, hit);
  return hit;
}

export function writeIndexEntry(entry: IndexEntry): void {
  touch(
    markdownCache,
    entry.url,
    { ...entry, markdownHash: contentHash(entry.markdown) },
    MAX_MARKDOWN_ENTRIES,
  );
}

/** Dead URLs (404, robots denial) are remembered so we never retry them. */
export function readNegative(url: string): boolean {
  return negativeCache.has(url);
}

export function writeNegative(url: string): void {
  touch(negativeCache as unknown as Map<string, true>, url, true, MAX_NEGATIVE_ENTRIES);
}

export function clearIndex(): void {
  markdownCache.clear();
  negativeCache.clear();
}

// ---------------------------------------------------------------------------
// Durable layer (Postgres)
// ---------------------------------------------------------------------------

export async function indexLookup(url: string): Promise<IndexEntry | null> {
  const local = readIndexEntry(url);
  if (local) return local;

  try {
    const result = await query<{
      url: string;
      fetched_at: Date;
      status: number;
      content_type: string;
      title: string | null;
      markdown: string;
      markdown_hash: string;
      depth: number;
    }>(
      `SELECT url, fetched_at, status, content_type, title, markdown,
              markdown_hash, depth
         FROM index_entries
        WHERE url = $1
        LIMIT 1`,
      [url],
    );

    const row = result.rows[0];
    if (!row) return null;

    const entry: IndexEntry = {
      url: row.url,
      fetchedAt: row.fetched_at,
      status: row.status,
      contentType: row.content_type,
      title: row.title ?? undefined,
      markdown: row.markdown,
      markdownHash: row.markdown_hash,
      domain: new URL(row.url).hostname,
      depth: row.depth,
    };
    writeIndexEntry(entry);
    return entry;
  } catch {
    // Index is an accelerator, never a dependency.
    return null;
  }
}

export async function indexStore(entry: IndexEntry): Promise<void> {
  writeIndexEntry(entry);

  if (entry.status >= 400) {
    writeNegative(entry.url);
  }

  try {
    await query(
      `INSERT INTO index_entries
         (url, fetched_at, status, content_type, title, markdown, markdown_hash, domain, depth)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (url) DO UPDATE SET
         fetched_at = EXCLUDED.fetched_at,
         status = EXCLUDED.status,
         content_type = EXCLUDED.content_type,
         title = EXCLUDED.title,
         markdown = EXCLUDED.markdown,
         markdown_hash = EXCLUDED.markdown_hash,
         depth = EXCLUDED.depth`,
      [
        entry.url,
        entry.fetchedAt,
        entry.status,
        entry.contentType,
        entry.title ?? null,
        entry.markdown,
        contentHash(entry.markdown),
        entry.domain,
        entry.depth,
      ],
    );

    if (entry.status < 400) {
      await query(
        `INSERT INTO index_domains (domain, last_success, hits)
         VALUES ($1, now(), 1)
         ON CONFLICT (domain) DO UPDATE SET
           last_success = now(),
           hits = index_domains.hits + 1,
           job_rich = CASE
             WHEN index_domains.job_rich THEN TRUE
             ELSE $2::boolean
           END`,
        [entry.domain, entry.markdown.length > 800],
      );
    }
  } catch (error) {
    logger.debug({ error, url: entry.url }, "Index store failed (non-fatal)");
  }
}

/**
 * Asks the index whether this URL has already produced job content, which is
 * how the frontier avoids re-scraping a domain we have already drained.
 */
export async function domainIsJobRich(domain: string): Promise<boolean> {
  const local = [...markdownCache.values()].some((entry) => entry.domain === domain);
  if (local) return true;

  try {
    const result = await query<{ job_rich: boolean }>(
      `SELECT job_rich FROM index_domains WHERE domain = $1 LIMIT 1`,
      [domain],
    );
    return result.rows[0]?.job_rich ?? false;
  } catch {
    return false;
  }
}

/**
 * Ranks a frontier by yield: domains that have historically produced jobs
 * (and that we have not hit recently) come first. This is what keeps a
 * multi-cycle crawl productive instead of re-reading the same sites.
 */
export async function rankFrontier<T extends { url: string }>(
  frontier: T[],
): Promise<T[]> {
  const scored = await Promise.all(
    frontier.map(async (item) => {
      let domain = "unknown";
      try {
        domain = new URL(item.url).hostname;
      } catch {
        // Malformed URLs sink to the bottom.
      }
      const jobRich = await domainIsJobRich(domain);
      return { item, score: jobRich ? 2 : 0 };
    }),
  );

  return scored
    .sort((a, b) => b.score - a.score)
    .map((scoredItem) => scoredItem.item);
}

// ---------------------------------------------------------------------------
// Concurrency / scaling
// ---------------------------------------------------------------------------

/**
 * Bounded-concurrency mapper. Firecrawl scales with a Redis-backed semaphore
 * and per-team credits; we scale with an in-process semaphore because our
 * throughput is bounded by how fast we can politely hit free sources anyway.
 */
export async function pooled<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ status: "fulfilled" | "rejected"; value?: R; reason?: unknown }>> {
  const results: Array<{ status: "fulfilled" | "rejected"; value?: R; reason?: unknown }> =
    new Array(items.length);
  let cursor = 0;

  const lane = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index]!;
      try {
        results[index] = { status: "fulfilled", value: await worker(item, index) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane),
  );

  return results;
}
