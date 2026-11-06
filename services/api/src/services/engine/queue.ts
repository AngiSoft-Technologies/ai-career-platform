/**
 * The length of the queue of pages waiting to be read.
 *
 * A queue is not a bucket that can be filled without limit. The browse
 * agent reads forty pages a cycle and the cycles are half an hour
 * apart, so the pipeline reads about eighty pages an hour — while a
 * single cycle of listing expansion can put six hundred rows into the
 * queue, because forty listing pages may each name fifteen postings.
 *
 * The result was a queue that grew faster than it drained: a thousand
 * pages waiting, the oldest read first, and a posting found today
 * read tomorrow, by which time it has closed.
 *
 * So the queue has a depth, and the agents that fill it stop filling it
 * when the depth is reached. What is in the queue is read; what would
 * make the queue longer is not added.
 *
 * The depth is a default rather than a rule: an operator who runs more
 * browse cycles may raise it, and the depth is per agent
 * (`max_queue_depth` in the agent's own configuration).
 */

import { query } from "../../db/pool.js";

/**
 * The queue's depth by default.
 *
 * Five hundred pages is about six hours of reading at the current rate.
 * That is the point at which a page found today is read a working day
 * later, which is too late for a vacancy.
 */
export const DEFAULT_MAX_QUEUE_DEPTH = 500;

/**
 * How many pages are waiting to be read.
 */
export async function pendingQueueDepth(): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM discovery_search_results
        WHERE status = 'pending'`,
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    // A queue that cannot be measured must not stop the work: the
    // agents fall back to their own per-run caps.
    return 0;
  }
}

/**
 * How many more pages the queue may take before it is full.
 *
 * Zero means the queue is full — the caller adds nothing.
 */
export async function queueRoom(limit: number): Promise<number> {
  if (limit <= 0) return 0;
  const depth = await pendingQueueDepth();
  return Math.max(0, limit - depth);
}
