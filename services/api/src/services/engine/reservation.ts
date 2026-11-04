/**
 * Reserve → reconcile budgets.
 *
 * The credit flow the platform study describes, adapted to what we actually
 * meter. There is no per-tenant credit ledger here — there is AI spend, and
 * the only honest budget we can enforce is one the whole fleet shares.
 *
 * The protocol is the same three phases the upstream uses for credits:
 *
 *   1. **Reserve.** Take the estimated cost *before* the work starts. If the
 *      reservation would exceed the budget, the work does not happen at all.
 *      This is the part a per-process counter cannot do: eleven API machines
 *      each with their own limit is eleven times the limit.
 *   2. **Reconcile.** After the work, settle the *actual* cost and give the
 *      difference back. An over-estimate must not permanently consume budget.
 *   3. **Refund on throw.** If the work throws, the whole reservation is
 *      returned — a failed call cost us nothing but the attempt.
 *
 * The accounting is atomic (one Lua script) and keyed by UTC day, so it
 * expires at midnight without a sweeper.
 *
 * Fail-open on Redis: if Redis cannot answer, the work proceeds and the
 * budget is not enforced. A throttle that takes the product down is worse
 * than a throttle that does not work.
 */

import { logger } from "../../logger.js";
import { redisIsReady, runScript } from "../../lib/redis-scripts.js";

export interface BudgetReservation {
  /** `false` means the work must not proceed: the budget is exhausted. */
  ok: boolean;
  /** USD taken from the budget (0 when unlimited or unaccounted). */
  reservedUsd: number;
  /** Budget used so far, when it could be read. */
  usedUsd: number | null;
  /** The limit that was applied, when there was one. */
  limitUsd: number | null;
  /** Settles the actual cost and refunds the difference. */
  settle: (actualUsd: number) => Promise<void>;
  /** Refunds the entire reservation. */
  release: () => Promise<void>;
}

function utcDayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function nextUtcMidnightEpoch(now = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.floor(next.getTime() / 1_000);
}

export function budgetKey(scope: string, subject: string): string {
  return `budget:${scope}:${subject}:${utcDayBucket()}`;
}

/**
 * Reserves `estimatedUsd` from a shared budget.
 *
 * `limitUsd <= 0` means "no limit": the reservation is a no-op that always
 * succeeds, so callers do not need a separate code path.
 */
export async function reserveBudget(input: {
  scope: string;
  subject: string;
  estimatedUsd: number;
  limitUsd: number;
}): Promise<BudgetReservation> {
  const estimated = Number.isFinite(input.estimatedUsd)
    ? Math.max(0, input.estimatedUsd)
    : 0;
  const limit = Number.isFinite(input.limitUsd) ? input.limitUsd : 0;

  const noop = (): BudgetReservation => ({
    ok: true,
    reservedUsd: 0,
    usedUsd: null,
    limitUsd: limit > 0 ? limit : null,
    settle: async () => undefined,
    release: async () => undefined,
  });

  if (limit <= 0 || estimated <= 0) return noop();
  if (!redisIsReady()) return noop();

  const key = budgetKey(input.scope, input.subject);
  const expireAt = nextUtcMidnightEpoch();

  try {
    const result = await runScript("quotaReserve", [key], [
      estimated,
      limit,
      expireAt,
    ]);
    if (result === null) return noop();

    const [admitted, used] = result as [number, number];
    if (Number(admitted) !== 1) {
      return {
        ok: false,
        reservedUsd: 0,
        usedUsd: Number(used),
        limitUsd: limit,
        settle: async () => undefined,
        release: async () => undefined,
      };
    }

    let settled = false;
    const refund = async (amount: number): Promise<void> => {
      if (settled || amount <= 0) return;
      settled = true;
      await runScript("quotaRelease", [key], [amount]).catch(() => undefined);
    };

    return {
      ok: true,
      reservedUsd: estimated,
      usedUsd: Number(used),
      limitUsd: limit,
      // Reconcile: give back what was reserved but not spent.
      settle: async (actualUsd: number) => {
        const actual = Number.isFinite(actualUsd) ? Math.max(0, actualUsd) : estimated;
        await refund(estimated - actual);
      },
      // Refund on throw: give back everything.
      release: async () => {
        await refund(estimated);
      },
    };
  } catch (error) {
    logger.debug(
      { error, scope: input.scope, subject: input.subject },
      "Budget reservation failed open",
    );
    return noop();
  }
}

/**
 * Runs `work` under a budget reservation.
 *
 * The work reports what it actually cost; the reservation is settled with
 * that. If the work throws, the whole reservation is refunded and the error
 * is rethrown unchanged.
 */
export async function withBudget<T>(
  input: {
    scope: string;
    subject: string;
    estimatedUsd: number;
    limitUsd: number;
  },
  work: (reservation: BudgetReservation) => Promise<{ result: T; actualUsd: number }>,
): Promise<T | null> {
  const reservation = await reserveBudget(input);
  if (!reservation.ok) return null;

  try {
    const { result, actualUsd } = await work(reservation);
    await reservation.settle(actualUsd);
    return result;
  } catch (error) {
    await reservation.release();
    throw error;
  }
}

/** Current spend against a budget, for dashboards. */
export async function budgetUsed(
  scope: string,
  subject: string,
): Promise<number> {
  if (!redisIsReady()) return 0;
  try {
    const { redis } = await import("../../db/redis.js");
    const raw = await redis.get(budgetKey(scope, subject));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}
