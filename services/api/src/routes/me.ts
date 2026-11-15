import { Router } from "express";
import { query } from "../db/pool.js";

export const meRouter = Router();

interface MeRow {
  id: string;
  email: string;
  name: string | null;
  profile_id: string | null;
  headline: string | null;
  location: string | null;
  roles: string[] | null;
  permissions: string[] | null;
}

/**
 * The caller's own account, roles, permissions and profile.
 *
 * This used to be four statements — the account, the roles, the permissions
 * and the profile — which meant four round trips to the database before the
 * response could be assembled. The database is in another region from the
 * API, so a round trip is not free, and the request that every signed-in
 * page load makes was paying for four of them.
 *
 * It is now one statement. The roles and the permissions are collected with
 * lateral subqueries, which are evaluated against the same snapshot as the
 * rest of the row, so the answer is the same as the four statements were.
 */
meRouter.get("/", async (_request, response, next) => {
  try {
    const userId = response.locals.userId as string;

    const result = await query<MeRow>(
      `SELECT u.id,
              u.email,
              u.display_name AS name,
              cp.id AS profile_id,
              cp.headline,
              cp.location,
              COALESCE(r.roles, '{}') AS roles,
              COALESCE(p.permissions, '{}') AS permissions
         FROM users u
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
         LEFT JOIN LATERAL (
           SELECT array_agg(DISTINCT role.name::text) AS roles
             FROM user_roles ur
             JOIN roles role ON role.id = ur.role_id
            WHERE ur.user_id = u.id
              AND ur.is_active = true
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
         ) r ON true
         LEFT JOIN LATERAL (
           SELECT array_agg(DISTINCT perm.name) AS permissions
             FROM user_roles ur
             JOIN role_permissions rp ON rp.role_id = ur.role_id
             JOIN permissions perm ON perm.id = rp.permission_id
            WHERE ur.user_id = u.id
              AND ur.is_active = true
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
         ) p ON true
        WHERE u.id = $1`,
      [userId],
    );

    const row = result.rows[0];
    response.json({
      user: row
        ? { id: row.id, email: row.email, name: row.name }
        : { id: userId, email: null, name: null },
      roles: row?.roles ?? [],
      permissions: row?.permissions ?? [],
      profile: row?.profile_id
        ? { id: row.profile_id, headline: row.headline, location: row.location }
        : null,
    });
  } catch (error) {
    next(error);
  }
});
