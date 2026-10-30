-- Password reset tokens owned by the API.
--
-- The token is emailed to the account owner. Only its hash is stored, so a
-- database leak cannot be used to reset a password.

CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_user_idx
  ON auth_password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_expiry_idx
  ON auth_password_reset_tokens (expires_at);
