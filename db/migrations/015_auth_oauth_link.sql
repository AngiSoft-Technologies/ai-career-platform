-- Account linking for the social sign-in flow.
--
-- A signed-in user can connect a provider account. The ticket binds the
-- authorization request to that user so the callback links the provider
-- identity instead of creating a new account.

ALTER TABLE auth_oauth_states
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'signin',
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS auth_oauth_states_user_idx
  ON auth_oauth_states (user_id)
  WHERE user_id IS NOT NULL;
