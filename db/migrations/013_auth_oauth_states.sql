-- OAuth state for the backend-owned social sign-in flow.
--
-- The API acts as an OAuth client of Neon Auth (which is itself an OAuth 2.1
-- authorization server with PKCE). The PKCE code verifier must stay on the
-- server: it is never sent to the browser and never appears in a URL.

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  state text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'google',
  code_verifier text NOT NULL,
  app_redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_oauth_states_expiry_idx
  ON auth_oauth_states (expires_at);
