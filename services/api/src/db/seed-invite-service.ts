import { config } from "../config.js";
import { query } from "../db/pool.js";
import { adminCreateUser } from "../auth/admin-client.js";
import { clearUserRoleCache } from "../services/rbac/index.js";

/**
 * Seeds the invitation service account.
 *
 * The account is an ordinary local password account — the API owns identity,
 * so there is no provider directory to register it in. It is given the
 * `admin` role so it can manage invitations through the admin API.
 */
async function main(): Promise<void> {
  const email = config.INVITE_SERVICE_EMAIL;
  const password = config.INVITE_SERVICE_PASSWORD;
  if (!email || !password) {
    throw new Error("INVITE_SERVICE_EMAIL and INVITE_SERVICE_PASSWORD are required");
  }

  let user;
  try {
    user = await adminCreateUser({
      email,
      password,
      name: "Invitation Service",
    });
    console.log(`created invitation service account ${email}`);
  } catch {
    // The account already exists; the role assignment below still runs so a
    // re-run repairs an account that never got its role.
    const existing = await query<{ id: string }>(
      `SELECT id FROM public.users WHERE lower(email) = lower($1)`,
      [email],
    );
    if (!existing.rows[0]) throw new Error(`no local account for ${email}`);
    user = { id: existing.rows[0].id, email, name: "Invitation Service" };
    console.log(`invitation service account ${email} already exists`);
  }

  const role = await query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'admin'`,
  );
  if (role.rows[0]) {
    await query(
      `INSERT INTO public.user_roles (user_id, role_id, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true`,
      [user.id, role.rows[0].id],
    );
    clearUserRoleCache(user.id);
  }

  console.log("invitation service account ready:", user);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
