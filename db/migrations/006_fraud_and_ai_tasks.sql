-- Fraud / ghost-job validation and AI task observability

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS risk_score numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risk_action text NOT NULL DEFAULT 'publish',
  ADD COLUMN IF NOT EXISTS risk_scored_at timestamptz,
  ADD COLUMN IF NOT EXISTS simhash bigint,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS canonical_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS opportunities_fingerprint_idx
  ON opportunities (fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS opportunities_risk_idx
  ON opportunities (risk_score DESC) WHERE risk_action = 'hold';
CREATE INDEX IF NOT EXISTS opportunities_canonical_idx
  ON opportunities (canonical_id) WHERE canonical_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS scam_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simhash bigint NOT NULL,
  label text NOT NULL DEFAULT 'scam_template',
  sample_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scam_signatures_simhash_idx
  ON scam_signatures (simhash);

CREATE TABLE IF NOT EXISTS profession_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES profession_taxonomy(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  depth integer NOT NULL DEFAULT 0,
  mpath text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT '',
  aliases text[] NOT NULL DEFAULT '{}',
  median_salary integer,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS profession_taxonomy_parent_idx
  ON profession_taxonomy (parent_id);
CREATE INDEX IF NOT EXISTS profession_taxonomy_mpath_idx
  ON profession_taxonomy (mpath);

CREATE TABLE IF NOT EXISTS profession_closure (
  ancestor uuid NOT NULL REFERENCES profession_taxonomy(id) ON DELETE CASCADE,
  descendant uuid NOT NULL REFERENCES profession_taxonomy(id) ON DELETE CASCADE,
  depth integer NOT NULL DEFAULT 1,
  PRIMARY KEY (ancestor, descendant)
);

CREATE TABLE IF NOT EXISTS opportunity_professions (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  profession_id uuid NOT NULL REFERENCES profession_taxonomy(id) ON DELETE CASCADE,
  confidence numeric(4, 3) NOT NULL DEFAULT 1,
  PRIMARY KEY (opportunity_id, profession_id)
);

CREATE INDEX IF NOT EXISTS opportunity_professions_profession_idx
  ON opportunity_professions (profession_id);

CREATE TABLE IF NOT EXISTS ai_task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  model text NOT NULL,
  provider text NOT NULL,
  prompt_version text NOT NULL DEFAULT '1.0',
  input_reference text,
  output_reference text,
  confidence numeric(4, 3),
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer,
  token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_usd numeric(10, 6),
  status text NOT NULL DEFAULT 'succeeded',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_task_runs_agent_idx ON ai_task_runs (agent, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_task_runs_created_idx ON ai_task_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text,
  account_email text,
  display_name text,
  scopes text[] NOT NULL DEFAULT '{}',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS user_connections_user_idx
  ON user_connections (user_id, status);

CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_type_idx ON events (type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS events_aggregate_idx
  ON events (aggregate_type, aggregate_id, recorded_at DESC);
