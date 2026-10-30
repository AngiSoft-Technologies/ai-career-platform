-- Auth boundary (P1): the API owns client identity.
--
-- Clients (web, mobile) talk to /v1/auth/* and never to the identity provider.
-- These tables hold only Job Radar state: which provider subject maps to which
-- local user, and the refresh-token families the API issues itself.

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_subject_key
    UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS auth_identities_user_idx
  ON auth_identities (user_id);

CREATE INDEX IF NOT EXISTS auth_identities_email_idx
  ON auth_identities (lower(email));

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  parent_id uuid REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL,
  user_agent text,
  ip text
);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_idx
  ON auth_refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_family_idx
  ON auth_refresh_tokens (family_id);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_expiry_idx
  ON auth_refresh_tokens (expires_at);

-- Offline replay support. A client resends the same Idempotency-Key and gets
-- the original response instead of a second write.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status integer,
  body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT idempotency_keys_scope_key
    UNIQUE (user_id, key, method, path)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx
  ON idempotency_keys (created_at);
