-- Platform hardening: device registry, saved-search alerts, application
-- timeline enrichment, feed state, remote config and privacy controls.
--
-- Every object is created idempotently. This file never backfills personal
-- data and never touches the existing `application_events`, `audit_events` or
-- `document_versions` history: document versions live in `documents` itself
-- (the `parent_document_id` chain written by `POST /documents/:id/versions`).

-- ---------------------------------------------------------------------------
-- Push device registry. The raw provider token is never stored: the API keeps
-- only a SHA-256 digest for identity and a short hint for support display.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('fcm', 'apns', 'huawei', 'samsung')),
  token_hash text NOT NULL,
  token_hint text NOT NULL DEFAULT '',
  -- Only populated when PUSH_TOKEN_ENCRYPTION_KEY is present. The plaintext
  -- token is never returned by an endpoint and never written to a log.
  token_ciphertext text,
  device_id text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '',
  app_version text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT '',
  topics text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, token_hash)
);

CREATE INDEX IF NOT EXISTS user_devices_user_idx
  ON user_devices (user_id, enabled, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS user_devices_provider_idx
  ON user_devices (provider, enabled) WHERE enabled = true;

DROP TRIGGER IF EXISTS user_devices_updated_at ON user_devices;
CREATE TRIGGER user_devices_updated_at BEFORE UPDATE ON user_devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Saved searches and alert cadence. `query` is the serialised filter object
-- accepted by the opportunity search endpoint; it must not contain PII.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  alert_enabled boolean NOT NULL DEFAULT false,
  cadence text NOT NULL DEFAULT 'daily'
    CHECK (cadence IN ('realtime', 'daily', 'weekly')),
  quiet_hours_start time,
  quiet_hours_end time,
  channels text[] NOT NULL DEFAULT '{in_app}',
  last_seen_at timestamptz,
  last_evaluated_at timestamptz,
  new_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_user_idx
  ON saved_searches (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS saved_searches_alerts_idx
  ON saved_searches (cadence, last_evaluated_at)
  WHERE alert_enabled = true;

DROP TRIGGER IF EXISTS saved_searches_updated_at ON saved_searches;
CREATE TRIGGER saved_searches_updated_at BEFORE UPDATE ON saved_searches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Application timeline enrichment. All rows are owned by both the
-- application and the user, so a route can always scope by `user_id`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'screening',
  starts_at timestamptz NOT NULL,
  location text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_interviews_user_idx
  ON application_interviews (user_id, starts_at);
CREATE INDEX IF NOT EXISTS application_interviews_application_idx
  ON application_interviews (application_id, starts_at);

DROP TRIGGER IF EXISTS application_interviews_updated_at ON application_interviews;
CREATE TRIGGER application_interviews_updated_at BEFORE UPDATE ON application_interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS application_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_notes_application_idx
  ON application_notes (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_attachments_application_idx
  ON application_attachments (application_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Per-user feed state, kept separate from the shared opportunity catalogue.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feed_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  seen_at timestamptz,
  saved_at timestamptz,
  applied_at timestamptz,
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS feed_state_user_seen_idx
  ON feed_state (user_id, seen_at DESC);
CREATE INDEX IF NOT EXISTS feed_state_user_saved_idx
  ON feed_state (user_id, saved_at DESC);

-- ---------------------------------------------------------------------------
-- Ops-controlled remote config and privacy preferences.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS remote_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO remote_config (key, value) VALUES
  ('min_supported_version', '"1.0.0"'::jsonb),
  ('force_update', 'false'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('feature_flags', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_privacy (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allow_analytics boolean NOT NULL DEFAULT false,
  allow_personalisation boolean NOT NULL DEFAULT true,
  screenshot_protection boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS user_privacy_updated_at ON user_privacy;
CREATE TRIGGER user_privacy_updated_at BEFORE UPDATE ON user_privacy
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Consent-gated analytics. `properties` is an allowlisted bag of scalars;
-- email addresses, names and tokens must never be written here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx
  ON analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_created_idx
  ON analytics_events (event, created_at DESC);
