ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS parent_document_id uuid REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_user_parent_created_idx
  ON documents (user_id, parent_document_id, created_at DESC);
