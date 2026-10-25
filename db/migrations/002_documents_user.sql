ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

UPDATE documents AS document
SET user_id = application.user_id
FROM applications AS application
WHERE document.application_id = application.id
  AND document.user_id IS NULL;

DELETE FROM documents WHERE user_id IS NULL;

ALTER TABLE documents
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS documents_user_opportunity_idx
  ON documents (user_id, opportunity_id, created_at DESC);
