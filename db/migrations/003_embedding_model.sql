DROP INDEX IF EXISTS opportunities_embedding_idx;

ALTER TABLE candidate_profiles
  ALTER COLUMN embedding TYPE vector USING embedding::vector;

ALTER TABLE opportunities
  ALTER COLUMN embedding TYPE vector USING embedding::vector;

ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS embedding_model text;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS embedding_model text;

CREATE INDEX IF NOT EXISTS opportunities_embedding_model_idx
  ON opportunities (embedding_model)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS candidate_profiles_embedding_model_idx
  ON candidate_profiles (embedding_model)
  WHERE embedding IS NOT NULL;
