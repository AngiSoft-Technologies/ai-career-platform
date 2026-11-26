-- Immutable application-submission approval snapshots.
--
-- Migration 037 introduced the application workflow. This follow-up is
-- intentionally separate because the migration runner records filenames, not
-- file contents: an environment where 037 was already applied will not run an
-- edited 037 again.

ALTER TABLE application_submission_runs
  ADD COLUMN IF NOT EXISTS document_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_fingerprint text;

-- Older resume requests used the 90-second browser lease while still in the
-- REQUESTED state, which made them expire almost immediately. Requested runs
-- use the independent requested-run TTL instead.
UPDATE application_submission_runs
   SET lease_expires_at = NULL
 WHERE status = 'REQUESTED'
   AND lease_expires_at IS NOT NULL;

-- Legacy active runs cannot be backfilled safely: their current documents may
-- no longer be the bytes the candidate approved. Expire them so the browser
-- fails closed and the candidate must approve a fresh package.
UPDATE application_submission_runs
   SET status = 'EXPIRED',
       error_code = 'SUBMISSION_SNAPSHOT_MISSING',
       error_detail = 'This run predates immutable submission snapshots and was expired before it could be resumed.'
 WHERE status IN ('REQUESTED', 'CLAIMED', 'RUNNING', 'WAITING_FOR_INPUT', 'WAITING_FOR_HUMAN')
   AND (
     approved_fingerprint IS NULL
     OR CASE
          WHEN jsonb_typeof(document_snapshot) = 'array'
            THEN jsonb_array_length(document_snapshot) = 0
          ELSE true
        END
   );

CREATE OR REPLACE FUNCTION protect_application_submission_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_snapshot IS DISTINCT FROM OLD.document_snapshot
     OR NEW.approved_fingerprint IS DISTINCT FROM OLD.approved_fingerprint
  THEN
    RAISE EXCEPTION 'SUBMISSION_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_submission_snapshot_immutable
  ON application_submission_runs;
CREATE TRIGGER application_submission_snapshot_immutable
  BEFORE UPDATE ON application_submission_runs
  FOR EACH ROW
  EXECUTE FUNCTION protect_application_submission_snapshot();
