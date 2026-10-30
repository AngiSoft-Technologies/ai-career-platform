-- n8n Workflow Management Tables
-- Stores workflow definitions, versions, and deployments

-- Workflow definitions created in our system
CREATE TABLE IF NOT EXISTS n8n_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  category text,
  tags text[] DEFAULT '{}',
  
  -- n8n workflow definition (nodes, connections, etc.)
  definition jsonb NOT NULL,
  
  -- n8n sync metadata
  n8n_workflow_id text,
  n8n_version_id text,
  deployed_at timestamptz,
  deployed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  
  -- Versioning
  version integer NOT NULL DEFAULT 1,
  changelog text,
  previous_version_id uuid REFERENCES n8n_workflows(id) ON DELETE SET NULL,
  
  -- Status
  is_active boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  
  -- Ownership
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Search
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, ''))
  ) STORED
);

-- Workflow versions (history)
CREATE TABLE IF NOT EXISTS n8n_workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES n8n_workflows(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition jsonb NOT NULL,
  changelog text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deployed_at timestamptz,
  deployed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (workflow_id, version)
);

-- Workflow deployments (audit log)
CREATE TABLE IF NOT EXISTS n8n_workflow_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES n8n_workflows(id) ON DELETE CASCADE,
  version integer NOT NULL,
  n8n_workflow_id text,
  n8n_version_id text,
  status text NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'rolled_back')),
  error_message text,
  deployed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Webhook endpoints registered in n8n
CREATE TABLE IF NOT EXISTS n8n_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES n8n_workflows(id) ON DELETE CASCADE,
  path text NOT NULL UNIQUE,
  method text NOT NULL DEFAULT 'POST',
  is_active boolean NOT NULL DEFAULT true,
  secret_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS n8n_workflows_category_idx ON n8n_workflows (category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS n8n_workflows_search_idx ON n8n_workflows USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS n8n_workflow_versions_workflow_idx ON n8n_workflow_versions (workflow_id, version DESC);
CREATE INDEX IF NOT EXISTS n8n_workflow_deployments_workflow_idx ON n8n_workflow_deployments (workflow_id, deployed_at DESC);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_n8n_workflows_updated_at
  BEFORE UPDATE ON n8n_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (if RLS is enabled)
ALTER TABLE n8n_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE n8n_workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE n8n_workflow_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE n8n_webhooks ENABLE ROW LEVEL SECURITY;

-- Admins and super_admins can manage all workflows
CREATE POLICY n8n_workflows_admin_all ON n8n_workflows
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
      AND r.name IN ('super_admin', 'admin')
    )
  );

-- Users can read active workflows
CREATE POLICY n8n_workflows_read_active ON n8n_workflows
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Creators can manage their own workflows
CREATE POLICY n8n_workflows_creator_manage ON n8n_workflows
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Version and deployment tables inherit workflow policies
CREATE POLICY n8n_versions_admin ON n8n_workflow_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM n8n_workflows w
      WHERE w.id = n8n_workflow_versions.workflow_id
      AND (
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid() AND ur.is_active = true
          AND r.name IN ('super_admin', 'admin')
        )
        OR w.created_by = auth.uid()
      )
    )
  );

CREATE POLICY n8n_deployments_admin ON n8n_workflow_deployments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM n8n_workflows w
      WHERE w.id = n8n_workflow_deployments.workflow_id
      AND (
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid() AND ur.is_active = true
          AND r.name IN ('super_admin', 'admin')
        )
      )
    )
  );

CREATE POLICY n8n_webhooks_admin ON n8n_webhooks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
      AND r.name IN ('super_admin', 'admin')
    )
  );