import { query } from "../../db/pool.js";

export interface Permission {
  name: string;
  description: string;
  resource: string;
  action: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  assignedAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

const userRoleCache = new Map<string, { roles: string[]; permissions: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  const cached = userRoleCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.roles.map((roleName) => ({ roleName } as UserRole));
  }

  const result = await query<UserRole>(
    `SELECT ur.id, ur.user_id AS "userId", ur.role_id AS "roleId",
            r.name AS "roleName", ur.assigned_at AS "assignedAt",
            ur.expires_at AS "expiresAt", ur.is_active AS "isActive"
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
    [userId],
  );

  const roles = result.rows.map((row) => row.roleName);
  const perms = await getPermissionsForRoles(roles);
  userRoleCache.set(userId, { roles, permissions: perms, expiresAt: Date.now() + CACHE_TTL_MS });

  return result.rows;
}

export async function getPermissionsForRoles(roleNames: string[]): Promise<string[]> {
  if (roleNames.length === 0) return [];

  const placeholders = roleNames.map((_, i) => `$${i + 1}`).join(",");
  const result = await query<{ name: string }>(
    `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
      WHERE r.name IN (${placeholders})`,
    roleNames,
  );

  return result.rows.map((row) => row.name);
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const cached = userRoleCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.permissions;
  }
  const roles = await getUserRoles(userId);
  const roleNames = roles.map((r) => r.roleName);
  return getPermissionsForRoles(roleNames);
}

export function clearUserRoleCache(userId: string): void {
  userRoleCache.delete(userId);
}

export async function assignRole(
  userId: string,
  roleName: string,
  assignedBy: string,
  expiresAt?: Date,
): Promise<void> {
  const role = await query<{ id: string }>("SELECT id FROM roles WHERE name = $1", [roleName]);
  if (!role.rows[0]) throw new Error(`ROLE_NOT_FOUND:${roleName}`);

  await query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, role_id) DO UPDATE SET
       assigned_by = EXCLUDED.assigned_by,
       expires_at = EXCLUDED.expires_at,
       is_active = true`,
    [userId, role.rows[0].id, assignedBy, expiresAt ?? null],
  );
  clearUserRoleCache(userId);
}

export async function removeRole(userId: string, roleName: string): Promise<void> {
  const role = await query<{ id: string }>("SELECT id FROM roles WHERE name = $1", [roleName]);
  if (!role.rows[0]) return;
  await query(
    `UPDATE user_roles SET is_active = false WHERE user_id = $1 AND role_id = $2`,
    [userId, role.rows[0].id],
  );
  clearUserRoleCache(userId);
}

export async function listAllRoles(): Promise<Role[]> {
  const result = await query<Role>(
    `SELECT id, name, description, is_system AS "isSystem"
       FROM roles
      ORDER BY is_system DESC, name`,
  );
  return result.rows;
}

export async function listAllPermissions(): Promise<Permission[]> {
  const result = await query<Permission>(
    `SELECT name, description, resource, action FROM permissions ORDER BY resource, action`,
  );
  return result.rows;
}