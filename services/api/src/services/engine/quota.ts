/**
 * Daily quota with a reserve/release handle.
 *
 * The failure mode this exists to prevent: admission is taken *before* the
 * work completes, so an operation that dies mid-flight must return its
 * budget. The release handle does that explicitly.
 *
 * When Redis cannot answer within the timeout the request is **allowed**
 * (fail-open), and the release waits on the in-flight call so it can still
 * compensate if the call turns out to have been admitted. A timeout must not
 * leak budget, and must not block the work either.
 */

import { redis } from "../../db/redis.js";
import { logger } from "../../logger.js";
import {
  redisIsReady,
  runScript,
  TIMED_OUT,
  timedOut,
  withTimeout,
} from "../../lib/redis-scripts.js";

export interface QuotaReservation {
  ok: boolean;
  used?: number;
  limit?: number;
  release?: () => Promise<void>;
}

const REDIS_TIMEOUT_MS = 500;

export function utcDayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function nextUtcMidnightEpoch(now = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.floor(next.getTime() / 1_000);
}

export async function reserveDailyQuota(
  scope: string,
  subject: string,
  amount = 1,
  limit: number | (() => Promise<number | null>) = 1_000,
): Promise<QuotaReservation> {
  const key = `quota:${scope}:${subject}:${utcDayBucket()}`;
  const expireAt = nextUtcMidnightEpoch();

  const resolveLimit = async (): Promise<number | null> =>
    typeof limit === "number" ? limit : limit();

  if (!redisIsReady()) {
    // Cannot account: allow rather than take the product down.
    return { ok: true };
  }

  const resolved = await resolveLimit();
  if (resolved === null) return { ok: true };

  let pending: Promise<unknown> | null = null;
  try {
    const call = runScript("quotaReserve", [key], [amount, resolved, expireAt]);
    pending = call;
    const result = await withTimeout(call, REDIS_TIMEOUT_MS);

    if (timedOut(result) || result === null || result === TIMED_OUT) {
      // Fail-open with a deferred release: compensate later if it turns out
      // the reservation actually landed.
      return {
        ok: true,
        release: async () => {
          const late = await pending!.catch(() => null);
          if (Array.isArray(late) && Number(late[0]) === 1) {
            await runScript("quotaRelease", [key], [amount]).catch(() => undefined);
          }
        },
      };
    }

    const [admitted, used] = result as [number, number];
    if (Number(admitted) === 1) {
      return {
        ok: true,
        used: Number(used),
        limit: resolved,
        release: async () => {
          await runScript("quotaRelease", [key], [amount]).catch(() => undefined);
        },
      };
    }
    return { ok: false, used: Number(used), limit: resolved };
  } catch (error) {
    logger.debug({ error, scope, subject }, "Quota reservation failed open");
    return { ok: true };
  }
}

/** Current usage for a scope/subject, for dashboards. 0 when unknown. */
export async function quotaUsed(scope: string, subject: string): Promise<number> {
  if (!redisIsReady()) return 0;
  try {
    const raw = await redis.get(`quota:${scope}:${subject}:${utcDayBucket()}`);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// The quiet host
//
// A queue with four hundred and sixty-three pages from one site is a
// site that has nothing: each page is a request, and each request
// answers with a page that holds no posting. The host is read twice,
// and then not at all for six hours.
//
// The window is six hours because of how often a host is reached. The
// Kenya agent reads sixteen of its seventy-four platforms per cycle,
// so a host comes round every five cycles — four hours or so. A one
// hour window expired long before the host was next reached, and the
// count was raised again from nothing: the host was read, and read
// again, and the platforms that do post were still waiting behind it.
//
// The count is in Redis and expires with it. When Redis cannot answer,
// the host is read — this must never stop the work.
// ---------------------------------------------------------------------------

const QUIET_HOST_THRESHOLD = 2;
const QUIET_HOST_TTL_SECONDS = 6 * 60 * 60;

/**
 * Notes that a host's page held no posting.
 */
export async function noteQuietHost(host: string): Promise<void> {
  if (!host || !redisIsReady()) return;
  try {
    const key = `quiet:${host}`;
    const count = await redis.incr(key);
    // The window is set as soon as the threshold is reached, and it is
    // set again on every later count — so a host that stays quiet keeps
    // its window and is not read again when it expires.
    if (count >= QUIET_HOST_THRESHOLD) {
      await redis.expire(key, QUIET_HOST_TTL_SECONDS);
    }
  } catch {
    // Fail open: the page is read.
  }
}

/**
 * Notes that a host's page held something after all.
 *
 * A host that recovers is read again, and the count of the times it
 * had nothing is forgotten.
 */
export async function noteLoudHost(host: string): Promise<void> {
  if (!host || !redisIsReady()) return;
  try {
    await redis.del(`quiet:${host}`);
  } catch {
    // Fail open: the page is read.
  }
}

/**
 * True when the host has had nothing to say, twice running.
 */
export async function hostIsQuiet(host: string): Promise<boolean> {
  if (!host || !redisIsReady()) return false;
  try {
    const raw = await redis.get(`quiet:${host}`);
    return raw !== null && Number(raw) >= QUIET_HOST_THRESHOLD;
  } catch {
    return false;
  }
}