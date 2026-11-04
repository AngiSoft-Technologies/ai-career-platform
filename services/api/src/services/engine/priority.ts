/**
 * Backlog-depth-derived queue priority.
 *
 * Rather than classifying tenants into tiers, priority comes from *observed*
 * backlog: a tenant's in-flight job ids live in a small Redis set whose TTL
 * is reset on every add (a sliding window of the last minute of activity).
 * Depth beyond a bucket adds a modifier to the priority number.
 *
 * Workers order by priority **ascending**, so a deeper backlog means a
 * *higher number* and therefore a later pick — heavy tenants are de-prioritised
 * naturally, and a tenant that backs off regains its place without a tier
 * change or an admin action.
 *
 * Every Redis failure falls back to the base priority: a throttle must never
 * be able to fail-closed a queue it is only supposed to shape.
 */

import { redis } from "../../db/redis.js";
import { logger } from "../../logger.js";
import { redisIsReady } from "../../lib/redis-scripts.js";

export interface PriorityOptions {
  /** Priority of an unbacklogged tenant. Workers sort ascending. */
  basePriority?: number;
  /** In-flight count before the modifier starts applying. */
  bucketLimit?: number;
  /** Priority added per job beyond the bucket. */
  planModifier?: number;
}

const DEFAULTS = { basePriority: 10, bucketLimit: 10, planModifier: 1 } as const;

function backlogKey(tenantKey: string): string {
  return `backlog:{${tenantKey}}`;
}

export async function registerBacklog(tenantKey: string, jobId: string): Promise<void> {
  if (!redisIsReady()) return;
  try {
    await redis
      .pipeline()
      .sadd(backlogKey(tenantKey), jobId)
      .expire(backlogKey(tenantKey), 60)
      .exec();
  } catch {
    // Priority is best-effort shaping, never a dependency.
  }
}

export async function clearBacklog(tenantKey: string, jobId: string): Promise<void> {
  if (!redisIsReady()) return;
  try {
    await redis.srem(backlogKey(tenantKey), jobId);
  } catch {
    // Best-effort.
  }
}

export async function backlogDepth(tenantKey: string): Promise<number> {
  if (!redisIsReady()) return 0;
  try {
    return await redis.scard(backlogKey(tenantKey));
  } catch {
    return 0;
  }
}

export async function jobPriority(
  tenantKey: string,
  options: PriorityOptions = {},
): Promise<number> {
  const basePriority = options.basePriority ?? DEFAULTS.basePriority;
  const bucketLimit = options.bucketLimit ?? DEFAULTS.bucketLimit;
  const planModifier = options.planModifier ?? DEFAULTS.planModifier;

  try {
    const depth = await backlogDepth(tenantKey);
    if (depth <= bucketLimit) return basePriority;
    return basePriority + Math.ceil((depth - bucketLimit) * planModifier);
  } catch (error) {
    logger.debug({ error, tenantKey }, "Backlog priority lookup failed; using base");
    return basePriority;
  }
}
