-- Agent-led application preparation and submission.
--
-- The old proactive flow generated one CV and one cover letter in a transient
-- cache. It had no durable job, no per-opportunity package, no missing-input
-- state, and no record of what the candidate approved. This migration makes
-- the workflow authoritative:
--
--   * one preparation record per (candidate, opportunity);
--   * one generated document set per preparation, linked back to its source;
--   * durable preparation and submission runs;
--   * a paired browser agent that can carry out the employer's form while the
--     candidate remains the approver.
--
-- Everything is additive and idempotent.

-- ---------------------------------------------------------------------------
-- Documents: a real primary source, edit state, and preparation ownership.
-- ---------------------------------------------------------------------------
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_base boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preparation_id uuid,
  ADD COLUMN IF NOT EXISTS user_edited boolean NOT NULL DEFAULT false;

UPDATE documents
   SET updated_at = created_at
 WHERE updated_at > created_at + interval '1 minute';

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A candidate has one source resume and, optionally, one source cover letter.
-- Tailored copies have opportunity_id set and are never marked as base.
CREATE UNIQUE INDEX IF NOT EXISTS documents_one_primary_cv_idx
  ON documents (user_id)
  WHERE is_base = true AND type = 'cv';

CREATE UNIQUE INDEX IF NOT EXISTS documents_one_primary_cover_letter_idx
  ON documents (user_id)
  WHERE is_base = true AND type = 'cover_letter';

-- Backfill the newest standalone source documents. Imported and manually
-- created resumes are the intended source; job-specific versions are excluded.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, type
           ORDER BY updated_at DESC, created_at DESC, id ASC
         ) AS position
    FROM documents
   WHERE opportunity_id IS NULL
     AND type IN ('cv', 'cover_letter')
)
UPDATE documents d
   SET is_base = true
  FROM ranked r
 WHERE d.id = r.id
   AND r.position = 1;

-- ---------------------------------------------------------------------------
-- Agent preferences.
-- ---------------------------------------------------------------------------
ALTER TABLE candidate_preferences
  ADD COLUMN IF NOT EXISTS auto_prepare_enabled boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Per-opportunity preparation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  source_cv_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  source_cover_letter_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  phase text NOT NULL DEFAULT 'queued',
  version integer NOT NULL DEFAULT 1,
  source_fingerprint text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  employer_intelligence jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  approved_fingerprint text,
  approved_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_detail text,
  prepared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id)
);

-- The table can also exist from a partially applied local development
-- migration, so keep the retry columns explicitly idempotent.
ALTER TABLE application_preparations
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS application_preparations_user_status_idx
  ON application_preparations (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS application_preparations_opportunity_idx
  ON application_preparations (opportunity_id, updated_at DESC);

-- Queue reconciliation and stale-run recovery scan the durable preparation
-- state directly, independent of automatic-match preferences.
CREATE INDEX IF NOT EXISTS application_preparations_queued_dispatch_idx
  ON application_preparations (next_attempt_at ASC NULLS FIRST, updated_at ASC, id ASC)
  WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS application_preparations_running_recovery_idx
  ON application_preparations (updated_at ASC, id ASC)
  WHERE status = 'RUNNING';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'documents_preparation_id_fkey'
       AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_preparation_id_fkey
      FOREIGN KEY (preparation_id) REFERENCES application_preparations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS documents_preparation_type_idx
  ON documents (preparation_id, type)
  WHERE preparation_id IS NOT NULL;

DROP TRIGGER IF EXISTS application_preparations_updated_at ON application_preparations;
CREATE TRIGGER application_preparations_updated_at BEFORE UPDATE ON application_preparations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS application_preparation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL REFERENCES application_preparations(id) ON DELETE CASCADE,
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'RUNNING',
  stage text NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (preparation_id, attempt)
);

CREATE INDEX IF NOT EXISTS application_preparation_runs_preparation_idx
  ON application_preparation_runs (preparation_id, attempt DESC);

-- Preserve the retry budget for rows created before the explicit counter
-- existed. Runs from older builds did not record a source fingerprint and
-- remain uncounted; the next attempt starts a fresh, bounded generation.
WITH source_attempts AS (
  SELECT ap.id,
         count(r.id)::int AS attempt_count
    FROM application_preparations ap
    LEFT JOIN application_preparation_runs r
      ON r.preparation_id = ap.id
     AND r.payload->>'sourceFingerprint' = ap.source_fingerprint
   GROUP BY ap.id
)
UPDATE application_preparations ap
   SET attempt_count = source_attempts.attempt_count
  FROM source_attempts
 WHERE source_attempts.id = ap.id
   AND ap.attempt_count = 0
   AND source_attempts.attempt_count > 0;

-- ---------------------------------------------------------------------------
-- Browser-agent devices and submission runs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS browser_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Browser agent',
  pairing_code_hash text NOT NULL,
  pairing_code_expires_at timestamptz NOT NULL,
  token_hash text,
  status text NOT NULL DEFAULT 'PENDING',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS browser_agents_pending_pairing_idx
  ON browser_agents (pairing_code_hash);

CREATE UNIQUE INDEX IF NOT EXISTS browser_agents_token_hash_idx
  ON browser_agents (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS browser_agents_user_status_idx
  ON browser_agents (user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS browser_agents_updated_at ON browser_agents;
CREATE TRIGGER browser_agents_updated_at BEFORE UPDATE ON browser_agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS application_submission_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  preparation_id uuid NOT NULL REFERENCES application_preparations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'REQUESTED',
  current_step text NOT NULL DEFAULT 'INSPECT_FORM',
  consent_at timestamptz NOT NULL,
  target_url text NOT NULL,
  allowed_hosts text[] NOT NULL DEFAULT '{}',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_fingerprint text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_detail text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The table can also exist from a partially applied local development
-- migration, so add the immutable approval snapshot columns explicitly and
-- idempotently.
ALTER TABLE application_submission_runs
  ADD COLUMN IF NOT EXISTS document_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS application_submission_active_idx
  ON application_submission_runs (application_id)
  WHERE status IN ('REQUESTED', 'CLAIMED', 'RUNNING', 'WAITING_FOR_INPUT', 'WAITING_FOR_HUMAN');

CREATE INDEX IF NOT EXISTS application_submission_pickup_idx
  ON application_submission_runs (user_id, status, created_at ASC)
  WHERE status = 'REQUESTED';

CREATE INDEX IF NOT EXISTS application_submission_application_idx
  ON application_submission_runs (application_id, created_at DESC);

-- Lease expiry runs independently and frequently, so it needs a partial index
-- that contains only the rows that can actually expire.
CREATE INDEX IF NOT EXISTS application_submission_lease_expiry_idx
  ON application_submission_runs (lease_expires_at ASC)
  WHERE status IN ('CLAIMED', 'RUNNING');

CREATE INDEX IF NOT EXISTS application_submission_requested_expiry_idx
  ON application_submission_runs (lease_expires_at ASC, created_at ASC)
  WHERE status = 'REQUESTED';

DROP TRIGGER IF EXISTS application_submission_runs_updated_at ON application_submission_runs;
CREATE TRIGGER application_submission_runs_updated_at BEFORE UPDATE ON application_submission_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS application_submission_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES application_submission_runs(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  step text NOT NULL,
  status text NOT NULL,
  url text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS application_submission_reports_run_idx
  ON application_submission_reports (run_id, created_at ASC);
