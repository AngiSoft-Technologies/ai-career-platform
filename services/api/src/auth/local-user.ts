import { query } from "../db/pool.js";
import { clearUserRoleCache } from "../services/rbac/index.js";

/**
 * Creates or updates the local account behind a verified identity.
 *
 * `userId` is preferred when the caller already owns a stable id (a client
 * that generated one before signing up). When that id is not present locally
 * but the email is, the existing row wins so a person who first signed in
 * with Google and later with email keeps one account.
 */
export async function ensureLocalUserRecord(input: {
  userId: string;
  email: string;
  name: string;
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

  clearUserRoleCache(userId);

  return userId;
}
