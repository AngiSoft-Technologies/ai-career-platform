import { query, withTransaction } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { ensurePreparation } from "./preparation.js";
import { boundedPreparationReconciliationOptions } from "./application-queue-policy.js";
import { automaticPreparationFailureState } from "./retry-policy.js";

export interface ScheduledPreparation {
  preparationId: string;
  version: number;
  userId: string;
  opportunityId: string;
}

export interface QueuedPreparation extends ScheduledPreparation {
  attemptCount: number;
  nextAttemptAt?: string;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function automaticPreparationQuarantineMs(): number {
  const hours = boundedInteger(
    Number(process.env.AUTO_PREPARE_QUARANTINE_HOURS ?? 24),
    24,
    1,
    7 * 24,
  );
  return hours * 60 * 60_000;
}

interface AutomaticPreparationCandidateLedgerRow {
  attempt_count: number;
  next_attempt_at: Date | null;
  quarantined_until: Date | null;
}

/**
 * Records a failure that happened before a durable preparation row could be
 * created or refreshed.
 *
 * The ledger is separate from application_preparations on purpose: setup
 * failures include a missing profile, an unreadable source document, and
 * transient database errors. Keeping their retry state here prevents the
 * same broken head candidate from consuming every automatic scheduler slot.
 */
export async function recordAutomaticPreparationFailure(input: {
  userId: string;
  opportunityId: string;
  error: unknown;
  maxAttempts?: number;
}): Promise<void> {
  const maxAttempts = boundedInteger(
    input.maxAttempts ??
      Number(process.env.APPLICATION_PREPARATION_MAX_ATTEMPTS ?? 3),
    3,
    1,
    10,
  );
  const message = input.error instanceof Error
    ? input.error.message
    : String(input.error);

  await withTransaction(async (client) => {
    const selected = await client.query<AutomaticPreparationCandidateLedgerRow>(
      `SELECT attempt_count, next_attempt_at, quarantined_until
         FROM automatic_preparation_candidates
        WHERE user_id = $1 AND opportunity_id = $2
        FOR UPDATE`,
      [input.userId, input.opportunityId],
    );
    const current = selected.rows[0];
    const now = new Date();
    const state = automaticPreparationFailureState({
      previousAttemptCount: current?.attempt_count,
      previousQuarantinedUntil: current?.quarantined_until,
      now,
      maxAttempts,
      quarantineMs: automaticPreparationQuarantineMs(),
    });

    await client.query(
      `INSERT INTO automatic_preparation_candidates (
         user_id, opportunity_id, attempt_count, next_attempt_at,
         quarantined_until, error_code, error_detail
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, opportunity_id) DO UPDATE set
         attempt_count = EXCLUDED.attempt_count,
         next_attempt_at = EXCLUDED.next_attempt_at,
         quarantined_until = EXCLUDED.quarantined_until,
         error_code = EXCLUDED.error_code,
         error_detail = EXCLUDED.error_detail,
         updated_at = now()`,
      [
        input.userId,
        input.opportunityId,
        state.attemptCount,
        state.nextAttemptAt,
        state.quarantinedUntil,
        "AUTOMATIC_PREPARATION_SETUP_FAILED",
        message.slice(0, 2_000),
      ],
    );
  });
}

async function clearAutomaticPreparationFailure(
  userId: string,
  opportunityId: string,
): Promise<void> {
  await query(
    `DELETE FROM automatic_preparation_candidates
      WHERE user_id = $1 AND opportunity_id = $2`,
    [userId, opportunityId],
  );
}

/**
 * Chooses strong matches for background preparation.
 *
 * Discovery keeps finding roles; the agent should keep working while the
 * candidate is away. The budget is deliberately bounded: a high-scoring
 * match, an opted-in candidate, and a source resume are all required. A role
 * that already has a live or reviewable preparation is not prepared twice.
 *
 * Failed rows are retried only while the current source fingerprint is below
 * the automatic attempt limit. An exhausted row receives a durable cooldown
 * when it is next inspected; a materially changed source can still start a
 * fresh generation. BLOCKED rows and cooled-down failures are excluded before
 * LIMIT, so they cannot consume every scheduler slot.
 */
export async function scheduleAutomaticPreparations(
  options: {
    minimumScore?: number;
    limit?: number;
    maxAttempts?: number;
  } = {},
): Promise<ScheduledPreparation[]> {
  const minimumScore = boundedInteger(
    options.minimumScore ??
      Number(process.env.AUTO_PREPARE_MINIMUM_SCORE ?? 72),
    72,
    0,
    100,
  );
  const limit = boundedInteger(
    options.limit ?? Number(process.env.AUTO_PREPARE_BATCH_SIZE ?? 12),
    12,
    1,
    50,
  );
  const maxAttempts = boundedInteger(
    options.maxAttempts ??
      Number(process.env.APPLICATION_PREPARATION_MAX_ATTEMPTS ?? 3),
    3,
    1,
    10,
  );

  const candidates = await query<{
    user_id: string;
    opportunity_id: string;
    score: number | string;
  }>(
    `SELECT m.user_id, m.opportunity_id, m.score
       FROM matches m
       JOIN candidate_preferences p ON p.user_id = m.user_id
       JOIN opportunities o ON o.id = m.opportunity_id
       LEFT JOIN automatic_preparation_candidates apc
         ON apc.user_id = m.user_id
        AND apc.opportunity_id = m.opportunity_id
      WHERE p.auto_prepare_enabled = true
        AND m.score >= $1
        AND o.status = 'active'
        AND COALESCE(o.risk_action, 'publish') <> 'hold'
        AND (apc.quarantined_until IS NULL OR apc.quarantined_until <= now())
        AND (apc.next_attempt_at IS NULL OR apc.next_attempt_at <= now())
        AND EXISTS (
          SELECT 1 FROM documents d
           WHERE d.user_id = m.user_id
             AND d.type = 'cv'
             AND (d.is_base = true OR d.opportunity_id IS NULL)
        )
        AND NOT EXISTS (
          SELECT 1 FROM application_preparations ap
           WHERE ap.user_id = m.user_id
             AND ap.opportunity_id = m.opportunity_id
             AND (
               ap.status NOT IN ('FAILED', 'STALE')
               OR (ap.next_attempt_at IS NOT NULL AND ap.next_attempt_at > now())
             )
        )
      ORDER BY m.score DESC, m.updated_at DESC, m.id ASC
      LIMIT $2`,
    [minimumScore, limit],
  );

  const scheduled: ScheduledPreparation[] = [];
  for (const candidate of candidates.rows) {
    try {
      const result = await ensurePreparation(
        candidate.user_id,
        candidate.opportunity_id,
        { maxAutomaticAttempts: maxAttempts, automatic: true },
      );
      try {
        await clearAutomaticPreparationFailure(
          candidate.user_id,
          candidate.opportunity_id,
        );
      } catch (error) {
        logger.warn(
          {
            userId: candidate.user_id,
            opportunityId: candidate.opportunity_id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Automatic preparation setup ledger could not be cleared",
        );
      }
      if (!result.shouldQueue) continue;
      scheduled.push({
        preparationId: result.preparation.id,
        version: result.preparation.version,
        userId: candidate.user_id,
        opportunityId: candidate.opportunity_id,
      });
    } catch (error) {
      // One broken posting must not stop the rest of the batch. Its failure is
      // persisted with a cooldown so the next scheduler pass can move on to
      // later candidates instead of selecting the same broken head again.
      try {
        await recordAutomaticPreparationFailure({
          userId: candidate.user_id,
          opportunityId: candidate.opportunity_id,
          error,
          maxAttempts,
        });
      } catch (ledgerError) {
        logger.error(
          {
            userId: candidate.user_id,
            opportunityId: candidate.opportunity_id,
            error: ledgerError instanceof Error
              ? ledgerError.message
              : String(ledgerError),
          },
          "Automatic preparation setup failure could not be persisted",
        );
      }
      logger.warn(
        {
          userId: candidate.user_id,
          opportunityId: candidate.opportunity_id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Automatic application preparation could not be scheduled",
      );
    }
  }
  return scheduled;
}

/**
 * Claims one bounded page of queued preparations for queue handoff.
 *
 * PostgreSQL is the durable source of truth. A worker can finish the
 * PostgreSQL commit and then fail while handing the job to BullMQ, leaving a
 * QUEUED row with no queue entry. The reconciler uses this list to repair
 * that handoff for manual, automatic, and recovered preparations alike.
 *
 * The selected rows receive a short dispatch lease through next_attempt_at.
 * That lease is what prevents a permanently broken head row from consuming
 * every scheduler page: it leaves the due set, later rows are selected in the
 * same pass, and the broken row is retried after the lease instead of
 * blocking the queue behind it.
 */
export async function listQueuedPreparations(
  options: { limit?: number; maxAttempts?: number; leaseMs?: number } = {},
): Promise<QueuedPreparation[]> {
  const {
    limit,
    maxAttempts,
    leaseMs,
  } = boundedPreparationReconciliationOptions(options);

  return withTransaction(async (client) => {
    // An exhausted row must not remain QUEUED forever. Fencing its version
    // also makes any old queue job harmless.
    await client.query(
      `UPDATE application_preparations
          SET status = 'FAILED',
              phase = 'failed',
              version = version + 1,
              next_attempt_at = NULL,
              error_code = 'PREPARATION_ATTEMPTS_EXHAUSTED',
              error_detail = 'The automatic preparation attempt budget was exhausted.'
        WHERE status = 'QUEUED'
          AND attempt_count >= $1`,
      [maxAttempts],
    );

    const selected = await client.query<{
      id: string;
      version: number;
      user_id: string;
      opportunity_id: string;
      attempt_count: number;
      next_attempt_at: Date | null;
    }>(
      `SELECT id, version, user_id, opportunity_id, attempt_count, next_attempt_at
         FROM application_preparations
        WHERE status = 'QUEUED'
          AND attempt_count < $1
          AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        -- A newly scheduled row has no next_attempt_at. Ordering NULLS FIRST
        -- makes every new batch jump ahead of older due work, which leaves a
        -- permanent tail of QUEUED rows. Treat fresh rows as due at creation.
        ORDER BY COALESCE(next_attempt_at, updated_at) ASC, id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [maxAttempts, limit],
    );

    if (selected.rows.length > 0) {
      await client.query(
        `UPDATE application_preparations
            SET next_attempt_at = now() + ($2 * interval '1 millisecond')
          WHERE id = ANY($1::uuid[])`,
        [selected.rows.map((row) => row.id), leaseMs],
      );
    }

    return selected.rows.map((row) => ({
      preparationId: row.id,
      version: row.version,
      userId: row.user_id,
      opportunityId: row.opportunity_id,
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at?.toISOString(),
    }));
  });
}
