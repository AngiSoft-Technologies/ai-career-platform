import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  acceptInvitation,
  findInvitationByToken,
  InvitationError,
} from "../services/invitations.js";

export const invitationRouter = Router();

const validateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const acceptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const tokenSchema = z.string().min(16).max(256);

const acceptSchema = z.object({
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120).optional(),
});

invitationRouter.get("/:token", validateLimiter, async (request, response, next) => {
  try {
    const token = tokenSchema.parse(request.params.token);
    const invitation = await findInvitationByToken(token);
    response.json({
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    });
  } catch (error) {
    const handled = invitationErrorHandler(error);
    if (handled) {
      response.status(handled.status).json(handled.body);
      return;
    }
    next(error);
  }
});

invitationRouter.post(
  "/:token/accept",
  acceptLimiter,
  async (request, response, next) => {
    try {
      const token = tokenSchema.parse(request.params.token);
      const body = acceptSchema.parse(request.body ?? {});
      const result = await acceptInvitation({
        token,
        password: body.password,
        name: body.name ?? null,
      });
      response.json({
        ok: true,
        email: result.email,
        role: result.role,
      });
    } catch (error) {
      const handled = invitationErrorHandler(error);
      if (handled) {
        response.status(handled.status).json(handled.body);
        return;
      }
      next(error);
    }
  },
);

export function invitationErrorHandler(
  error: unknown,
): { status: number; body: { error: string; code: string } } | null {
  if (error instanceof InvitationError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "That request was not valid", code: "INVALID_REQUEST" },
    };
  }
  return null;
}
