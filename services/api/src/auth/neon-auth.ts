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
      issuer: [origin, authBaseUrl],
    });

    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : [];
    const allowedAudiences = new Set<string>([
      origin,
      authBaseUrl,
      config.API_URL,
      `${config.API_URL}/v1/mcp`,
      `${config.API_URL}/mcp`,
    ]);
    if (!audiences.some((audience) => allowedAudiences.has(audience))) {
      return null;
    }

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
  const inserted = await query<{ id: string; role: string }>(
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

  const neonUser = await query<{ role: string }>(
    `SELECT role FROM neon_auth."user" WHERE id = $1`,
    [userId],
  );
  if (neonUser.rows[0]?.role) {
    await syncNeonRole(userId, neonUser.rows[0].role);
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
