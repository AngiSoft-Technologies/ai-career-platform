-- Guided applications and remote-browser workspaces.
--
-- The preparation and submission tables still own the approval boundary: a
-- guidance session is an interaction layer over an already-approved package.
-- Nothing here stores a password, OTP, card detail or legal attestation;
-- detected field *values* are deliberately absent from the schema.
--
-- NOTE: db/migrations is gitignored beyond 017. This file has to be shipped
-- through the owner's migration channel before the API routes can use it.

-- Expose the submission method that was already implied by the approved
-- blueprint. Browser commands still use the same fields/documents; this is
-- metadata for clients, not a change to the browser protocol.
ALTER TABLE application_submission_runs
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'browser';

CREATE TABLE IF NOT EXISTS application_guidance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  submission_run_id uuid REFERENCES application_submission_runs(id) ON DELETE SET NULL,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  target_url text,
  target_host text,
  site_key text,
  playbook_version integer,
  hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  consent_at timestamptz NOT NULL,
  last_observation_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guidance_sessions_user_application_idx
  ON application_guidance_sessions (user_id, application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guidance_sessions_current_idx
  ON application_guidance_sessions (user_id, application_id, updated_at DESC)
  WHERE status IN ('ACTIVE', 'WAITING_FOR_HUMAN');

DROP TRIGGER IF EXISTS application_guidance_sessions_updated_at
  ON application_guidance_sessions;
CREATE TRIGGER application_guidance_sessions_updated_at
  BEFORE UPDATE ON application_guidance_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Site knowledge is shared catalogue data. Proposals are never trusted as
-- guidance until an operator publishes them, and `proposed_by` records who
-- offered the steps without making them user-specific.
CREATE TABLE IF NOT EXISTS application_site_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key text NOT NULL,
  host text NOT NULL,
  platform text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PROPOSED',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocker_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(3, 2) NOT NULL DEFAULT 0.50,
  proposed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_key, version)
);

CREATE INDEX IF NOT EXISTS site_playbooks_lookup_idx
  ON application_site_playbooks (site_key, status, version DESC);
CREATE INDEX IF NOT EXISTS site_playbooks_host_lookup_idx
  ON application_site_playbooks (host, status, version DESC);

DROP TRIGGER IF EXISTS application_site_playbooks_updated_at
  ON application_site_playbooks;
CREATE TRIGGER application_site_playbooks_updated_at
  BEFORE UPDATE ON application_site_playbooks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS browser_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  guidance_session_id uuid NOT NULL
    REFERENCES application_guidance_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'STARTING',
  stream_path text,
  target_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS browser_workspaces_user_application_idx
  ON browser_workspaces (user_id, application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS browser_workspaces_current_idx
  ON browser_workspaces (user_id, application_id, updated_at DESC)
  WHERE status IN ('STARTING', 'READY', 'BUSY');

DROP TRIGGER IF EXISTS browser_workspaces_updated_at
  ON browser_workspaces;
CREATE TRIGGER browser_workspaces_updated_at
  BEFORE UPDATE ON browser_workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
