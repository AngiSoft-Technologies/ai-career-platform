import { config } from "../config.js";
import { query } from "../db/pool.js";
import { clearUserRoleCache } from "../services/rbac/index.js";

export interface NeonIdentity {
  userId: string;
  email: string;
  name: string;
}

const NEON_TO_APP_ROLE: Record<string, string> = {
  super_admin: "super_admin",
  admin: "admin",
  moderator: "moderator",
  support_agent: "support_agent",
  source_curator: "source_curator",
  analyst: "analyst",
  job_seeker: "job_seeker",
  automation: "automation",
};

async function syncNeonRole(userId: string, neonRole: string | null): Promise<void> {
  const appRole = neonRole ? NEON_TO_APP_ROLE[neonRole] : null;
  if (!appRole) return;

  const result = await query<{ name: string }>(
    `SELECT name FROM roles WHERE name = $1`,
    [appRole],
  );
  if (result.rowCount === 0) return;

  await query(
    `INSERT INTO public.user_roles (user_id, role_id)
     SELECT $1, r.id FROM roles r
      WHERE r.name = $2
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur WHERE ur.user_id = $1 AND ur.role_id = r.id AND ur.is_active = true
        )
     ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, expires_at = NULL`,
    [userId, appRole],
  );
}

export async function ensureLocalUser(identity: NeonIdentity): Promise<string> {
  const neonUser = await query<{ role: string }>(
    `SELECT role FROM neon_auth."user" WHERE id = $1`,
    [identity.userId],
  );
  return ensureLocalUserRecord({
    userId: identity.userId,
    email: identity.email,
    name: identity.name,
    neonRole: neonUser.rows[0]?.role ?? null,
  });
}

/**
 * Creates or updates the local mirror of an identity.
 *
 * `userId` is preferred when the provider already owns a stable id (Neon). When
 * that id is not present locally but the email is, the existing row wins so a
 * person who first signed in with Google and later with email keeps one account.
 */
export async function ensureLocalUserRecord(input: {
  userId: string;
  email: string;
  name: string;
  neonRole?: string | null;
}): Promise<string> {
  let userId = input.userId;

  const byId = await query<{ id: string }>(
    `SELECT id FROM public.users WHERE id = $1`,
    [userId],
  );
  if (byId.rows[0]) {
    await query(
      `UPDATE public.users
          SET email = $2, display_name = $3, updated_at = now()
        WHERE id = $1`,
      [userId, input.email, input.name],
    );
  } else {
    const byEmail = await query<{ id: string }>(
      `SELECT id FROM public.users
        WHERE lower(email) = lower($1)
        ORDER BY created_at ASC
        LIMIT 1`,
      [input.email],
    );
    const existing = byEmail.rows[0];
    if (existing) {
      userId = existing.id;
      await query(
        `UPDATE public.users
            SET display_name = $2, updated_at = now()
          WHERE id = $1`,
        [userId, input.name],
      );
    } else {
      const inserted = await query<{ id: string }>(
        `INSERT INTO public.users (id, email, display_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, input.email, input.name],
      );
      const createdId = inserted.rows[0]?.id;
      if (!createdId) throw new Error("USER_SYNC_FAILED");
      userId = createdId;
    }
  }

  await query(
    `INSERT INTO public.candidate_profiles (
       user_id, full_name, headline, summary, location, country,
       years_experience, seniority
     )
     VALUES ($1, $2, '', '', '', 'Kenya', 0, 'junior')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, input.name],
  );

  if (input.neonRole) {
    await syncNeonRole(userId, input.neonRole);
  } else {
    await query(
      `INSERT INTO public.user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r
        WHERE r.name = 'job_seeker'
          AND NOT EXISTS (
            SELECT 1 FROM user_roles ur WHERE ur.user_id = $1 AND ur.is_active = true
          )
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId],
    );
  }

  clearUserRoleCache(userId);

  return userId;
}
