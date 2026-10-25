import { Router } from "express";
import { query } from "../db/pool.js";
import { getUserPermissions, getUserRoles } from "../services/rbac/index.js";

export const meRouter = Router();

meRouter.get("/", async (_request, response, next) => {
  try {
    const userId = response.locals.userId as string;

    const account = await query<{ id: string; email: string; name: string | null }>(
      `SELECT id, email, display_name AS name FROM users WHERE id = $1`,
      [userId],
    );

    const [roles, permissions] = await Promise.all([
      getUserRoles(userId),
      getUserPermissions(userId),
    ]);

    const profile = await query<{ id: string; headline: string | null; location: string | null }>(
      `SELECT id, headline, location FROM candidate_profiles WHERE user_id = $1`,
      [userId],
    );

    response.json({
      user: account.rows[0] ?? { id: userId, email: null, name: null },
      roles: roles.map((role) => role.roleName),
      permissions,
      profile: profile.rows[0] ?? null,
    });
  } catch (error) {
    next(error);
  }
});
