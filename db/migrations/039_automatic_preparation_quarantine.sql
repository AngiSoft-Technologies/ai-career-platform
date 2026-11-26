-- Durable quarantine for automatic preparation setup failures.
--
-- Some automatic candidates fail before an application_preparations row can be
-- created: a missing profile, an unreadable source document, or a transient
-- database failure. Without a separate ledger, the same highest-scoring
-- candidates are selected on every scheduler pass and can starve later roles.

CREATE TABLE IF NOT EXISTS automatic_preparation_candidates (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  quarantined_until timestamptz,
  error_code text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS automatic_preparation_candidates_due_idx
  ON automatic_preparation_candidates (
    next_attempt_at ASC NULLS FIRST,
    quarantined_until ASC NULLS FIRST,
    user_id,
    opportunity_id
  );

DROP TRIGGER IF EXISTS automatic_preparation_candidates_updated_at
  ON automatic_preparation_candidates;
CREATE TRIGGER automatic_preparation_candidates_updated_at
  BEFORE UPDATE ON automatic_preparation_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
