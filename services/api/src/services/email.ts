import nodemailer from "nodemailer";
import { config } from "../config.js";
import { logger } from "../logger.js";

export type EmailProvider = "smtp" | "auth";

export interface EmailResult {
  sent: boolean;
  provider: EmailProvider | null;
  reason?: string;
}

function smtpConfigured(): boolean {
  return Boolean(config.SMTP_HOST && config.SMTP_FROM);
}

export function invitationBaseUrl(): string {
  return (config.INVITE_BASE_URL ?? config.WEB_ORIGINS[0] ?? "").replace(
    /\/$/,
    "",
  );
}

const HTML_ENTITIES: Record<string, string> = {
  "&": String.fromCharCode(38) + "amp;",
  "<": String.fromCharCode(38) + "lt;",
  ">": String.fromCharCode(38) + "gt;",
  '"': String.fromCharCode(38) + "quot;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ENTITIES[char] ?? char);
}

async function sendViaSmtp(input: {
  to: string;
  name?: string | null;
  roleLabel: string;
  inviteUrl: string;
}): Promise<EmailResult> {
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth:
      config.SMTP_USER && config.SMTP_PASSWORD
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
  });

  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";

  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: input.to,
    subject: "You have been invited to Job Radar",
    text: [
      greeting,
      "",
      `You have been invited to Job Radar as ${input.roleLabel}.`,
      "",
      `Set your password and join here: ${input.inviteUrl}`,
      "",
      "This link expires in 7 days.",
    ].join("\n"),
    html: [
      `<p>${greeting}</p>`,
      `<p>You have been invited to Job Radar as <strong>${escapeHtml(input.roleLabel)}</strong>.</p>`,
      `<p><a href="${escapeHtml(input.inviteUrl)}">Set your password and join Job Radar</a></p>`,
      "<p>This link expires in 7 days.</p>",
    ].join(""),
  });

  return { sent: true, provider: "smtp" };
}

/**
 * Sends a password reset email.
 *
 * The reset link carries a single-use token that the API validates.
 */
export async function sendPasswordResetEmail(input: {
  to: string;
  name?: string | null;
  resetUrl: string;
}): Promise<EmailResult> {
  if (!smtpConfigured()) {
    return { sent: false, provider: null, reason: "email delivery unavailable" };
  }

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth:
      config.SMTP_USER && config.SMTP_PASSWORD
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
  });

  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";

  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: input.to,
    subject: "Reset your Job Radar password",
    text: [
      greeting,
      "",
      "Use the link below to choose a new password.",
      "",
      input.resetUrl,
      "",
      "This link expires in one hour. If you did not ask for it, ignore this email.",
    ].join("\n"),
    html: [
      `<p>${greeting}</p>`,
      "<p>Use the link below to choose a new password.</p>",
      `<p><a href="${escapeHtml(input.resetUrl)}">Choose a new password</a></p>`,
      "<p>This link expires in one hour. If you did not ask for it, ignore this email.</p>",
    ].join(""),
  });

  return { sent: true, provider: "smtp" };
}

export async function sendInvitationEmail(input: {
  to: string;
  name?: string | null;
  roleLabel: string;
  inviteUrl: string;
  fallbackSender: () => Promise<boolean>;
}): Promise<EmailResult> {
  if (smtpConfigured()) {
    try {
      return await sendViaSmtp(input);
    } catch (error) {
      logger.error(
        { errorMessage: error instanceof Error ? error.message : String(error) },
        "Invitation email via SMTP failed, falling back",
      );
    }
  }

  const fallbackSent = await input.fallbackSender();
  if (fallbackSent) {
    return { sent: true, provider: "auth" };
  }
  return { sent: false, provider: null, reason: "email delivery unavailable" };
}
