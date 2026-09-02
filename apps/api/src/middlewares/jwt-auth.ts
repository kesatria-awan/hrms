import type { MiddlewareHandler } from "hono";

import type { UserRole, WorkspaceMemberRole } from "@/api/db/schema";
import type { AppEnv } from "@/api/lib/types";

import { verifyAccessToken } from "@/api/lib/jwt";

/**
 * JWT authentication middleware
 * Verifies JWT access tokens and sets auth context variables — zero DB queries.
 */
export function jwtAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Skip verification if userId is already set (for tests with mock auth — per D-06)
    if (c.get("userId")) {
      await next();
      return;
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
    if (!payload) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    c.set("userId", payload.sub);
    c.set("userEmail", payload.email);
    c.set("userRole", payload.role as UserRole);
    c.set("workspaceId", payload.workspaceId);
    c.set("workspaceRole", payload.workspaceRole as WorkspaceMemberRole | null);
    c.set("isSuperAdmin", payload.isSuperAdmin);
    c.set("emailVerifiedAt", payload.emailVerifiedAt ?? null);

    await next();
  };
}

/**
 * Optional JWT authentication middleware
 * Allows unauthenticated requests. Sets auth context if valid token is present,
 * otherwise continues without error.
 */
export function optionalJwtAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      await next();
      return;
    }

    try {
      const token = authHeader.slice(7);
      const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
      if (payload) {
        c.set("userId", payload.sub);
        c.set("userEmail", payload.email);
        c.set("userRole", payload.role as UserRole);
        c.set("workspaceId", payload.workspaceId);
        c.set("workspaceRole", payload.workspaceRole as WorkspaceMemberRole | null);
        c.set("isSuperAdmin", payload.isSuperAdmin);
        c.set("emailVerifiedAt", payload.emailVerifiedAt ?? null);
      }
    }
    catch {
      // Swallow — optional auth continues without context
    }

    await next();
  };
}
