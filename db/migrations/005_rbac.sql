CREATE TYPE user_role AS ENUM (
  'super_admin',
  'admin',
  'source_curator',
  'moderator',
  'support_agent',
  'analyst',
  'job_seeker',
  'automation'
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name user_role NOT NULL UNIQUE,
  description text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles (user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles (role_id) WHERE is_active = true;

INSERT INTO roles (name, description, is_system) VALUES
  ('super_admin', 'Full platform access including role management and billing', true),
  ('admin', 'Platform operations: sources, companies, taxonomy, moderation', true),
  ('source_curator', 'Verifies submitted sources, manages connectors and source health', true),
  ('moderator', 'User reports, content review, document/report takedowns', true),
  ('support_agent', 'User support, account assistance, read-only user data', true),
  ('analyst', 'Read-only analytics, funnel metrics, match quality, conversion', true),
  ('job_seeker', 'Default role: profile, search, applications, documents, follow-ups', false),
  ('automation', 'Service accounts for workers, ingestion, AI tasks', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, description, resource, action) VALUES
  -- Users
  ('users:read', 'Read any user profile', 'users', 'read'),
  ('users:write', 'Create/update any user', 'users', 'write'),
  ('users:delete', 'Delete any user', 'users', 'delete'),
  ('users:roles:read', 'View user roles', 'users:roles', 'read'),
  ('users:roles:write', 'Assign/remove user roles', 'users:roles', 'write'),
  -- Roles
  ('roles:read', 'List roles and permissions', 'roles', 'read'),
  ('roles:write', 'Create/update roles', 'roles', 'write'),
  -- Sources
  ('sources:read', 'View job sources', 'sources', 'read'),
  ('sources:write', 'Create/update sources', 'sources', 'write'),
  ('sources:verify', 'Verify source submissions', 'sources', 'verify'),
  ('sources:health', 'View source health and checks', 'sources', 'health'),
  -- Companies
  ('companies:read', 'View companies', 'companies', 'read'),
  ('companies:write', 'Create/update companies', 'companies', 'write'),
  -- Opportunities
  ('opportunities:read', 'View opportunities', 'opportunities', 'read'),
  ('opportunities:write', 'Create/update opportunities', 'opportunities', 'write'),
  -- Applications
  ('applications:read', 'View applications', 'applications', 'read'),
  ('applications:write', 'Create/update applications', 'applications', 'write'),
  ('applications:status', 'Update application status', 'applications', 'status'),
  -- Documents
  ('documents:read', 'View documents', 'documents', 'read'),
  ('documents:write', 'Generate/upload documents', 'documents', 'write'),
  ('documents:validate', 'Validate ATS compatibility', 'documents', 'validate'),
  -- Follow-ups
  ('followups:read', 'View follow-ups', 'followups', 'read'),
  ('followups:write', 'Schedule/mark follow-ups', 'followups', 'write'),
  -- AI
  ('ai:read', 'Use AI features', 'ai', 'read'),
  ('ai:configure', 'Configure AI providers', 'ai', 'configure'),
  -- Analytics
  ('analytics:read', 'View analytics dashboards', 'analytics', 'read'),
  ('analytics:export', 'Export analytics data', 'analytics', 'export'),
  -- Settings
  ('settings:read', 'View platform settings', 'settings', 'read'),
  ('settings:write', 'Modify platform settings', 'settings', 'write'),
  -- System
  ('system:health', 'View system health', 'system', 'health'),
  ('system:logs', 'View system logs', 'system', 'logs'),
  -- Moderation
  ('moderation:queue', 'View moderation queue', 'moderation', 'queue'),
  ('moderation:act', 'Act on moderation items', 'moderation', 'act'),
  -- Support
  ('support:read', 'View support tickets', 'support', 'read'),
  ('support:write', 'Respond to support', 'support', 'write')
ON CONFLICT (name) DO NOTHING;

-- Default role-permission grants
-- super_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin: platform ops except role management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name NOT IN ('roles:write','users:roles:write')
ON CONFLICT DO NOTHING;

-- source_curator
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'source_curator' AND p.name IN (
  'sources:read','sources:write','sources:verify','sources:health',
  'companies:read','companies:write','opportunities:read',
  'analytics:read'
)
ON CONFLICT DO NOTHING;

-- moderator
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'moderator' AND p.name IN (
  'users:read','moderation:queue','moderation:act',
  'documents:read','analytics:read'
)
ON CONFLICT DO NOTHING;

-- support_agent
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'support_agent' AND p.name IN (
  'users:read','applications:read','documents:read',
  'analytics:read','support:read','support:write'
)
ON CONFLICT DO NOTHING;

-- analyst
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'analyst' AND p.name IN (
  'analytics:read','analytics:export',
  'opportunities:read','companies:read','users:read'
)
ON CONFLICT DO NOTHING;

-- job_seeker: own resources only (enforced in middleware)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'job_seeker' AND p.name IN (
  'users:read','opportunities:read','applications:read',
  'applications:status','documents:read','documents:write',
  'documents:validate','followups:read','followups:write',
  'ai:read','sources:read'
)
ON CONFLICT DO NOTHING;

-- automation: system tasks
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'automation' AND p.name IN (
  'sources:write','sources:health','opportunities:write',
  'documents:write','ai:read','analytics:read',
  'system:health'
)
ON CONFLICT DO NOTHING;

-- Seed demo user as job_seeker
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, r.id, '00000000-0000-0000-0000-000000000001'::uuid
FROM roles r WHERE r.name = 'job_seeker'
ON CONFLICT DO NOTHING;