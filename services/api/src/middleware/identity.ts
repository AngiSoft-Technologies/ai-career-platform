import type { NextFunction, Request, Response } from "express";
import {
  resolveIdentity,
  UnauthorizedError,
} from "../auth/resolve-identity.js";
import { requestAccessToken } from "../auth/cookies.js";
import { verificationState } from "../auth/verification.js";
import { config } from "../config.js";

export async function identity(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = requestAccessToken(request);
    const resolved = await resolveIdentity({
      authorization: token ? `Bearer ${token}` : null,
      headerUserId: request.header("x-user-id"),
    });

    response.locals.userId = resolved.userId;
    response.locals.authenticated = resolved.authenticated;

    // Long-lived sessions still have to re-prove themselves on a schedule.
    // Once `last_verified_at` is older than the step-up interval, account
    // routes answer VERIFICATION_REQUIRED until the user completes one of
    // their enrolled methods. Auth endpoints are mounted before this
    // middleware, so the verification flow itself stays reachable.
    if (resolved.authenticated && config.AUTH_STEP_UP_INTERVAL_SECONDS > 0) {
      const state = await verificationState(resolved.userId);
      if (state.requiresVerification) {
        response.status(403).json({
          error: "Verify your identity to continue",
          code: "VERIFICATION_REQUIRED",
          verifiedAt: state.verifiedAt,
        });
        return;
      }
    }

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    next(error);
  }
}
