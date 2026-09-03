import type { MiddlewareHandler } from "hono";

import type { UserRole } from "@/api/db/schema";
import type { AppEnv } from "@/api/lib/types";

import { verifyAccessToken } from "@/api/lib/jwt";

/**
 * JWT authentication middleware
 * Verifies JWT access tokens and sets auth context variables — zero DB queries.
 */
export function jwtAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Skip verification if userId is already set (for tests with mock auth)
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
    c.set("emailVerifiedAt", payload.emailVerifiedAt ?? null);

    await next();
  };
}

/**
 * Optional JWT authentication middleware
 */
export function optionalJwtAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      await next();
      return;
    }

    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
    if (payload) {
      c.set("userId", payload.sub);
      c.set("userEmail", payload.email);
      c.set("userRole", payload.role as UserRole);
      c.set("emailVerifiedAt", payload.emailVerifiedAt ?? null);
    }

    await next();
  };
}

/**
 * HR admin guard — must be used after jwtAuth()
 */
export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.get("userRole") !== "hr_admin") {
      return c.json({ message: "Forbidden — HR admin only" }, 403);
    }
    await next();
  };
}