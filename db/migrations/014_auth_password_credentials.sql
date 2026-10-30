-- Credentials owned by the API.
--
-- The API is the only party that verifies passwords. Neon Auth is used solely
-- as the social identity broker (it owns the Google OAuth client), so the
-- password hash never leaves this database.

CREATE TABLE IF NOT EXISTS auth_password_credentials (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  password_params text NOT NULL DEFAULT 'scrypt',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_password_credentials_updated_idx
  ON auth_password_credentials (updated_at);
