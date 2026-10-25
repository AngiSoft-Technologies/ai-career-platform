ALTER TABLE job_sources
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS adapter text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS check_frequency_minutes integer NOT NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reliability numeric(4, 3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS discovered_count integer NOT NULL DEFAULT 0;

UPDATE job_sources
SET external_id = lower(name)
WHERE external_id IS NULL;

ALTER TABLE job_sources
  ALTER COLUMN external_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS job_sources_status_idx
  ON job_sources (status, next_check_at);
CREATE INDEX IF NOT EXISTS job_sources_submitted_by_idx
  ON job_sources (submitted_by)
  WHERE submitted_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS source_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'unknown',
  http_status integer,
  jobs_found integer NOT NULL DEFAULT 0,
  jobs_added integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_checks_source_idx
  ON source_checks (source_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_sources (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id uuid REFERENCES job_sources(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'web',
  source_url text NOT NULL,
  external_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, source_url)
);

CREATE TABLE IF NOT EXISTS followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  channel text NOT NULL DEFAULT 'email',
  note text NOT NULL DEFAULT '',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, due_at)
);

CREATE INDEX IF NOT EXISTS followups_due_idx
  ON followups (status, due_at);

ALTER TABLE application_blueprints
  ADD COLUMN IF NOT EXISTS email_recipient text,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS deadline timestamptz,
  ADD COLUMN IF NOT EXISTS user_input_required jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

CREATE TABLE IF NOT EXISTS candidate_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_countries text[] NOT NULL DEFAULT '{}',
  preferred_locations text[] NOT NULL DEFAULT '{}',
  preferred_roles text[] NOT NULL DEFAULT '{}',
  desired_seniority text NOT NULL DEFAULT 'junior',
  min_salary integer,
  currency text NOT NULL DEFAULT 'KES',
  remote_only boolean NOT NULL DEFAULT false,
  willing_to_relocate boolean NOT NULL DEFAULT false,
  notifications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
