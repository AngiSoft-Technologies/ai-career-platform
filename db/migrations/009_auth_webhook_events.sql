CREATE TABLE IF NOT EXISTS auth_webhook_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_webhook_events_received_idx
  ON auth_webhook_events (received_at DESC);
