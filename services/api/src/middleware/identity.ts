import type { NextFunction, Request, Response } from "express";
import {
  resolveIdentity,
  UnauthorizedError,
} from "../auth/resolve-identity.js";

export async function identity(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resolved = await resolveIdentity({
      authorization: request.header("authorization"),
      headerUserId: request.header("x-user-id"),
    });

    response.locals.userId = resolved.userId;
    response.locals.authenticated = resolved.authenticated;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    next(error);
  }
}
