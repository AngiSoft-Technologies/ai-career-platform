CREATE TABLE IF NOT EXISTS admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role user_role NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_by_email text,
  auth_user_id uuid,
  email_sent boolean NOT NULL DEFAULT false,
  email_provider text,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_invitations_email_idx
  ON admin_invitations (lower(email));

CREATE INDEX IF NOT EXISTS admin_invitations_status_idx
  ON admin_invitations (status);

CREATE INDEX IF NOT EXISTS admin_invitations_created_idx
  ON admin_invitations (created_at DESC);
