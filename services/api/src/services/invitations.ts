import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { query } from "../db/pool.js";
import { logger } from "../logger.js";
import {
  adminCreateUser,
  adminSetUserPassword,
  AuthAdminError,
  findAuthUserByEmail,
  requestPasswordReset,
} from "../auth/admin-client.js";
import { invitationBaseUrl, sendInvitationEmail } from "./email.js";
import { clearUserRoleCache } from "./rbac/index.js";

const INVITABLE_ROLES = [
  "super_admin",
  "admin",
  "source_curator",
  "moderator",
  "support_agent",
  "analyst",
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  emailSent: boolean;
  emailProvider: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
  invitedByEmail: string | null;
}

export class InvitationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "InvitationError";
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function isInvitableRole(value: string): value is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(value);
}

export function invitableRoles(): InvitableRole[] {
  return [...INVITABLE_ROLES];
}

export function inviteUrlFor(token: string): string {
  return `${invitationBaseUrl()}/invite/${token}`;
}

function mapInvitation(row: Record<string, unknown>): Invitation {
  return {
    id: String(row.id),
    email: String(row.email),
    role: String(row.role),
    status: String(row.status),
    emailSent: Boolean(row.email_sent),
    emailProvider: row.email_provider ? String(row.email_provider) : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at as string).toISOString() : null,
    expiresAt: new Date(row.expires_at as string).toISOString(),
    createdAt: new Date(row.created_at as string).toISOString(),
    invitedByEmail: row.invited_by_email ? String(row.invited_by_email) : null,
  };
}

async function roleLabel(role: string): Promise<string> {
  const result = await query<{ description: string }>(
    `SELECT description FROM roles WHERE name = $1`,
    [role],
  );
  const description = result.rows[0]?.description;
  if (!description) return role;
  return description.charAt(0).toUpperCase() + description.slice(1);
}

async function ensureLocalUser(input: {
  authUserId: string;
  email: string;
  name: string;
  role: string;
}): Promise<void> {
  await query(
    `INSERT INTO public.users (id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name`,
    [input.authUserId, input.email, input.name],
  );

  await query(
    `INSERT INTO public.candidate_profiles (
       user_id, full_name, headline, summary, location, country,
       years_experience, seniority
     )
     VALUES ($1, $2, '', '', '', 'Kenya', 0, 'junior')
     ON CONFLICT (user_id) DO NOTHING`,
    [input.authUserId, input.name],
  );

  await query(
    `INSERT INTO public.user_roles (user_id, role_id)
     SELECT $1, r.id FROM roles r
      WHERE r.name = $2
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur
           WHERE ur.user_id = $1 AND ur.role_id = r.id AND ur.is_active = true
        )
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [input.authUserId, input.role],
  );

  await query(
    `UPDATE public.user_roles ur SET is_active = false
       FROM public.roles r
      WHERE r.id = ur.role_id
        AND ur.user_id = $1
        AND r.name = 'job_seeker'
        AND ur.is_active = true`,
    [input.authUserId],
  );

  clearUserRoleCache(input.authUserId);
}

export async function createInvitation(input: {
  email: string;
  role: string;
  name?: string | null;
  invitedBy: string;
  invitedByEmail: string | null;
}): Promise<{ invitation: Invitation; inviteUrl: string; emailSent: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new InvitationError("That email address is not valid", "INVALID_EMAIL");
  }
  if (!isInvitableRole(input.role)) {
    throw new InvitationError("That role cannot be invited", "INVALID_ROLE");
  }

  const existingAuthUser = await findAuthUserByEmail(email);
  let authUserId = existingAuthUser?.id ?? null;
  let accountReady = Boolean(authUserId);
  const displayName = input.name?.trim() || existingAuthUser?.name || (email.split("@")[0] ?? email);

  if (!authUserId) {
    try {
      const created = await adminCreateUser({
        email,
        password: `${randomBytes(18).toString("base64url")}9a`,
        name: displayName,
      });
      authUserId = created.id;
      accountReady = true;
    } catch (error) {
      logger.error(
        { errorMessage: error instanceof Error ? error.message : String(error) },
        "Invitation account could not be pre-created",
      );
    }
  }

  if (authUserId) {
    await ensureLocalUser({
      authUserId,
      email,
      name: displayName,
      role: input.role,
    });
  }

  const token = generateToken();
  const inserted = await query<Record<string, unknown>>(
    `INSERT INTO admin_invitations (
       email, role, token_hash, invited_by, invited_by_email, auth_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      email,
      input.role,
      hashToken(token),
      input.invitedBy,
      input.invitedByEmail,
      authUserId,
    ],
  );

  const createdRow = inserted.rows[0];
  if (!createdRow) {
    throw new InvitationError("We could not create that invitation", "INVITATION_CREATE_FAILED", 500);
  }
  const invitation = mapInvitation(createdRow);
  const inviteUrl = inviteUrlFor(token);
  const label = await roleLabel(input.role);

  const emailResult = await sendInvitationEmail({
    to: email,
    name: input.name ?? existingAuthUser?.name ?? null,
    roleLabel: label,
    inviteUrl,
    fallbackSender: async () => {
      if (!authUserId || !accountReady) return false;
      return requestPasswordReset({
        email,
        redirectTo: inviteUrl,
      });
    },
  });

  const updated = await query<Record<string, unknown>>(
    `UPDATE admin_invitations
        SET email_sent = $2, email_provider = $3, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [invitation.id, emailResult.sent, emailResult.provider],
  );

  return {
    invitation: mapInvitation(updated.rows[0] ?? createdRow),
    inviteUrl,
    emailSent: emailResult.sent,
  };
}

export async function listInvitations(limit = 100): Promise<Invitation[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM admin_invitations ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map(mapInvitation);
}

export async function resendInvitation(id: string): Promise<{
  invitation: Invitation;
  inviteUrl: string;
  emailSent: boolean;
}> {
  const existing = await query<Record<string, unknown>>(
    `SELECT * FROM admin_invitations WHERE id = $1`,
    [id],
  );
  const row = existing.rows[0];
  if (!row) {
    throw new InvitationError("Invitation not found", "INVITATION_NOT_FOUND", 404);
  }
  const invitation = mapInvitation(row);
  if (invitation.status !== "pending") {
    throw new InvitationError(
      "Only pending invitations can be resent",
      "INVITATION_NOT_PENDING",
      409,
    );
  }

  const token = generateToken();
  await query(
    `UPDATE admin_invitations
        SET token_hash = $2,
            expires_at = now() + interval '7 days',
            updated_at = now()
      WHERE id = $1`,
    [id, hashToken(token)],
  );

  const inviteUrl = inviteUrlFor(token);
  const label = await roleLabel(invitation.role);

  const emailResult = await sendInvitationEmail({
    to: invitation.email,
    name: null,
    roleLabel: label,
    inviteUrl,
    fallbackSender: async () => {
      const authUserId = row.auth_user_id ? String(row.auth_user_id) : null;
      if (!authUserId) return false;
      return requestPasswordReset({
        email: invitation.email,
        redirectTo: inviteUrl,
      });
    },
  });

  const updated = await query<Record<string, unknown>>(
    `UPDATE admin_invitations
        SET email_sent = $2, email_provider = $3, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, emailResult.sent, emailResult.provider],
  );

  return {
    invitation: mapInvitation(updated.rows[0] ?? row),
    inviteUrl,
    emailSent: emailResult.sent,
  };
}

export async function revokeInvitation(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE admin_invitations
        SET status = 'revoked', updated_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findInvitationByToken(
  token: string,
): Promise<Invitation & { authUserId: string | null }> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM admin_invitations WHERE token_hash = $1`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) {
    throw new InvitationError("This invitation is not valid", "INVITATION_NOT_FOUND", 404);
  }

  const invitation = mapInvitation(row);
  if (invitation.status === "revoked") {
    throw new InvitationError("This invitation was cancelled", "INVITATION_REVOKED", 410);
  }
  if (invitation.status === "accepted") {
    throw new InvitationError("This invitation was already used", "INVITATION_USED", 410);
  }
  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    throw new InvitationError("This invitation has expired", "INVITATION_EXPIRED", 410);
  }

  return {
    ...invitation,
    authUserId: row.auth_user_id ? String(row.auth_user_id) : null,
  };
}

export async function acceptInvitation(input: {
  token: string;
  password: string;
  name?: string | null;
}): Promise<{ email: string; role: string; authUserId: string }> {
  const invitation = await findInvitationByToken(input.token);

  let authUserId = invitation.authUserId;
  const authUser = authUserId
    ? await findAuthUserByEmail(invitation.email)
    : null;
  if (authUser) authUserId = authUser.id;

  const displayName = input.name?.trim() || authUser?.name || (invitation.email.split("@")[0] ?? invitation.email);

  if (!authUserId) {
    try {
      const created = await adminCreateUser({
        email: invitation.email,
        password: input.password,
        name: displayName,
      });
      authUserId = created.id;
    } catch (error) {
      logger.error(
        { errorMessage: error instanceof Error ? error.message : String(error) },
        "Invitation account creation failed",
      );
      throw new InvitationError(
        "We could not create that account. Ask an administrator to resend the invitation.",
        "INVITATION_ACCOUNT_CREATE_FAILED",
        502,
      );
    }
  } else {
    try {
      await adminSetUserPassword({
        userId: authUserId,
        newPassword: input.password,
      });
    } catch (error) {
      if (error instanceof AuthAdminError) {
        throw new InvitationError(
          "We could not set that password. Ask an administrator to resend the invitation.",
          "INVITATION_PASSWORD_SET_FAILED",
          502,
        );
      }
      throw error;
    }
  }

  await ensureLocalUser({
    authUserId,
    email: invitation.email,
    name: displayName,
    role: invitation.role,
  });

  await query(
    `UPDATE admin_invitations
        SET status = 'accepted', accepted_at = now(), auth_user_id = $2, updated_at = now()
      WHERE id = $1`,
    [invitation.id, authUserId],
  );

  return { email: invitation.email, role: invitation.role, authUserId };
}

export function invitationExpiryDays(): number {
  return 7;
}

export function invitationBase(): string {
  return config.INVITE_BASE_URL ?? config.WEB_ORIGINS[0] ?? "";
}
