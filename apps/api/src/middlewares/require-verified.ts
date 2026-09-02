import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "@/api/lib/types";

/**
 * Require email verification middleware.
 * Per D-02: returns 403 with email_not_verified code (distinct from 401 = not logged in).
 * Per D-03: separate from jwtAuth(), added per-route on workspace routes, NOT on auth routes.
 *
 * Reads `emailVerifiedAt` from Hono context (set by jwtAuth() from JWT claim).
 * Call after jwtAuth() in the middleware chain.
 */
export function requireVerified(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const emailVerifiedAt = c.get("emailVerifiedAt");
    if (!emailVerifiedAt) {
      return c.json(
        { message: "Email not verified", code: "email_not_verified" },
        403,
      );
    }
    await next();
  };
}
