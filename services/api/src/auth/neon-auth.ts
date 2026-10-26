import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";
import { query } from "../db/pool.js";
import { clearUserRoleCache } from "../services/rbac/index.js";
import { logger } from "../logger.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let remoteKeySet: ReturnType<typeof createRemoteJWKSet> | null = null;

function getKeySet(): ReturnType<typeof createRemoteJWKSet> | null {
  if (!config.NEON_AUTH_JWKS_URL) return null;
  remoteKeySet ??= createRemoteJWKSet(new URL(config.NEON_AUTH_JWKS_URL), {
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
  return remoteKeySet;
}

export interface NeonIdentity {
  userId: string;
  email: string;
  name: string;
}

export async function verifyNeonToken(
  token: string,
): Promise<NeonIdentity | null> {
  const keySet = getKeySet();
  const authBaseUrl = config.NEON_AUTH_BASE_URL;
  if (!keySet || !authBaseUrl) return null;

  const origin = new URL(authBaseUrl).origin;

  try {
    const { payload } = await jwtVerify(token, keySet, {
      audience: origin,
      issuer: [origin, authBaseUrl],
    });

    const subject = payload.sub;
    if (!subject || payload.role === "anonymous") return null;
    if (!uuidPattern.test(subject)) return null;

    const result = await query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name
         FROM neon_auth."user"
        WHERE id = $1
          AND banned IS NOT TRUE`,
      [subject],
    );
    const user = result.rows[0];
    if (!user) {
      logger.warn({ subject }, "Neon Auth user not found in neon_auth.user");
      return null;
    }

    return { userId: user.id, email: user.email, name: user.name };
  } catch (error) {
    logger.error(
      {
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: (error as { code?: string }).code,
      },
      "Neon Auth token verification failed",
    );
    return null;
  }
}

export async function ensureLocalUser(identity: NeonIdentity): Promise<string> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO public.users (id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name
     RETURNING id`,
    [identity.userId, identity.email, identity.name],
  );

  const userId = inserted.rows[0]?.id;
  if (!userId) throw new Error("USER_SYNC_FAILED");

  await query(
    `INSERT INTO public.candidate_profiles (
       user_id, full_name, headline, summary, location, country,
       years_experience, seniority
     )
     VALUES ($1, $2, '', '', '', 'Kenya', 0, 'junior')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, identity.name],
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
