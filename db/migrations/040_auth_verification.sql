-- Step-up verification and long-lived sessions.
--
-- A session can now stay alive for a long time (the refresh token TTL is
-- measured in months, not days), so "the user signed in once" stops being
-- proof that the person at the keyboard is still the account owner. The
-- account therefore carries a `last_verified_at` timestamp: interactive
-- sign-ins stamp it, and once it is older than the step-up interval the API
-- asks for a fresh verification before serving account data again.
--
-- Verification itself is method-plural on purpose. Today the methods are a
-- TOTP authenticator app and an emailed magic link; the tables do not assume
-- that is all there will ever be. A user may enrol several methods, pick a
-- default, and fall back to another one when the default is failing.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

-- One row per (user, method, destination) the user has enrolled.
--
--   * `totp`        — an authenticator app; `secret_encrypted` holds the
--                     base32 secret sealed with the API's JWT secret;
--   * `email_link`  — a single-use link sent to `destination` (the email);
--   * `email_otp`   — a short code sent to `destination`;
--   * `passkey`     — reserved for WebAuthn credentials.
--
-- `confirmed_at` is null while an enrolment is still being proven (for
-- example a TOTP secret that has been shown but not yet entered once).
CREATE TABLE IF NOT EXISTS user_verification_methods (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL,
  destination text NOT NULL,
  secret_encrypted text,
  is_default boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, method, destination)
);

CREATE INDEX IF NOT EXISTS user_verification_methods_default_idx
  ON user_verification_methods (user_id)
  WHERE is_default;

-- Outstanding verification challenges. Today only `email_link` produces a
-- row: the raw token travels in the email and only its SHA-256 digest is
-- stored here, exactly like the password-reset and handoff tokens.
CREATE TABLE IF NOT EXISTS auth_verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL,
  destination text NOT NULL,
  token_hash text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  redirect_uri text NOT NULL,
  purpose text NOT NULL DEFAULT 'step_up',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5
);

CREATE INDEX IF NOT EXISTS auth_verification_challenges_expiry_idx
  ON auth_verification_challenges (expires_at);

CREATE INDEX IF NOT EXISTS auth_verification_challenges_user_idx
  ON auth_verification_challenges (user_id, created_at DESC);
