import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "@/api/lib/types";

/**
 * Tenant guard middleware
 * Ensures users can only access resources within their workspace
 * Super admins bypass this restriction
 */
export function tenantGuard(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    const isSuperAdmin = c.get("isSuperAdmin");
    const workspaceId = c.get("workspaceId");

    // Must be authenticated
    if (!userId) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    // Super admins can access any workspace
    if (isSuperAdmin) {
      await next();
      return;
    }

    // Regular users must belong to a workspace
    if (!workspaceId) {
      return c.json(
        { message: "Workspace required. Please complete workspace setup." },
        403,
      );
    }

    await next();
  };
}

/**
 * Super admin guard middleware
 * Restricts access to super admin only routes
 */
export function superAdminGuard(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    const isSuperAdmin = c.get("isSuperAdmin");

    if (!userId) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    if (!isSuperAdmin) {
      return c.json({ message: "Forbidden: Super admin access required" }, 403);
    }

    await next();
  };
}

/**
 * Workspace admin guard middleware
 * Restricts access to workspace owner or admin (or super admin)
 */
export function workspaceAdminGuard(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    const isSuperAdmin = c.get("isSuperAdmin");
    const workspaceRole = c.get("workspaceRole");

    if (!userId) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    if (isSuperAdmin) {
      await next();
      return;
    }

    if (workspaceRole !== "owner" && workspaceRole !== "admin") {
      return c.json({ message: "Forbidden: Admin access required" }, 403);
    }

    await next();
  };
}
