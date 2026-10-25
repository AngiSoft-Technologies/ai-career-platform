import type { NextFunction, Request, Response } from "express";
import { getUserPermissions } from "../services/rbac/index.js";
import { config } from "../config.js";

export function requirePermission(...permissions: string[]) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = response.locals.userId as string;
      if (!userId) {
        response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
        return;
      }

      const userPerms = await getUserPermissions(userId);
      const hasAll = permissions.every((perm) => userPerms.includes(perm));

      if (!hasAll) {
        response.status(403).json({
          error: "Insufficient permissions",
          code: "FORBIDDEN",
          required: permissions,
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: string[]) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = response.locals.userId as string;
      if (!userId) {
        response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
        return;
      }

      const { getUserRoles } = await import("../services/rbac/index.js");
      const userRoles = await getUserRoles(userId);
      const userRoleNames = userRoles.map((r) => r.roleName);

      const hasRole = roles.some((role) => userRoleNames.includes(role));
      if (!hasRole) {
        response.status(403).json({
          error: "Insufficient role",
          code: "FORBIDDEN",
          required: roles,
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireOwnershipOrPermission(
  resourceUserIdParam: string = "userId",
  permission: string,
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUserId = response.locals.userId as string;
      const resourceUserId = request.params[resourceUserIdParam];

      if (currentUserId === resourceUserId) {
        next();
        return;
      }

      const perms = await getUserPermissions(currentUserId);
      if (perms.includes(permission)) {
        next();
        return;
      }

      response.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    } catch (error) {
      next(error);
    }
  };
}

export async function attachPermissions(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = response.locals.userId as string;
    if (!userId) {
      next();
      return;
    }
    const perms = await getUserPermissions(userId);
    response.locals.permissions = perms;
    next();
  } catch (error) {
    next(error);
  }
}