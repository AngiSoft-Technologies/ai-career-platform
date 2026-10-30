-- P3 — schema at scale: the indexes §7 of PLATFORM_ARCHITECTURE_10M.md calls for.
--
-- Verified against the live schema before writing this file. Two claims in that
-- document had to be corrected:
--   * `opportunities` has `salary_min`, not `min_salary`.
--   * `matches` has no `dismissed_at`, so the "top matches" predicate is gone.
-- Everything else is documented here to be re-checkable with `EXPLAIN`.
--
-- Measured before: `notifications` and `matches` had *no* index beyond their
-- primary keys, so every user notification poll and every "best matches" query
-- was a sequential scan. The tables are nearly empty, which is exactly why it
-- was invisible.
--
-- The runner wraps each migration in a transaction, so `CREATE INDEX
-- CONCURRENTLY` cannot be used here. These tables are small (3,103
-- opportunities; 1 match), so plain CREATE INDEX is instant and takes a brief
-- lock nobody can observe. Once they are large, these must move to CONCURRENTLY
-- and the runner needs an opt-out — flagged in the doc as a pre-Launch step.

-- notifications: PK-only before. The per-user unread badge is a full seq scan.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- matches: "best matches" sorts by score per user. No index, so a sort over the
-- whole table every time.
CREATE INDEX IF NOT EXISTS matches_user_score_idx
  ON matches (user_id, score DESC);

CREATE INDEX IF NOT EXISTS matches_opportunity_idx
  ON matches (opportunity_id);

-- opportunities: the mobile feed filters. Composite order follows
-- equality-then-sort: equality columns first (user_id, country, status),
-- the sort column last (posted_at DESC).
CREATE INDEX IF NOT EXISTS opportunities_recent_feed_idx
  ON opportunities (country, status, posted_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS opportunities_seniority_feed_idx
  ON opportunities (country, status, seniority, posted_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS opportunities_min_salary_idx
  ON opportunities (country, salary_min)
  WHERE status = 'active';

-- BRIN for the append-only time column: a few kilobytes for a column that is
-- written in near-monotonic order and read by wide ranges.
CREATE INDEX IF NOT EXISTS opportunities_created_brin
  ON opportunities USING BRIN (created_at) WITH (pages_per_range = 32);

-- applications: per-user recency list.
CREATE INDEX IF NOT EXISTS applications_user_created_idx
  ON applications (user_id, created_at DESC);

-- followups: the worker sweep already targets due_at; the user-facing list did
-- not have a per-user entry.
CREATE INDEX IF NOT EXISTS followups_user_due_idx
  ON followups (user_id, due_at)
  WHERE status = 'pending';

-- audit_events: PK-only, and the admin UI asks "what happened to this user".
CREATE INDEX IF NOT EXISTS audit_events_user_created_idx
  ON audit_events (user_id, created_at DESC);

-- Statement-level timings, so EXPLAIN usage can be verified against what
-- actually runs rather than guessed. Neon supports this extension.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Autovacuum: the append-heavy tables accumulate dead tuples fastest under
-- ingest, and the defaults leave them under-vacuumed at 10M users.
ALTER TABLE opportunities SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);
ALTER TABLE opportunity_skills SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);
ALTER TABLE notifications SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE audit_events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- The indexes above are only useful if the planner knows about them.
ANALYZE notifications;
ANALYZE matches;
ANALYZE opportunities;
ANALYZE applications;
ANALYZE followups;
ANALYZE audit_events;
