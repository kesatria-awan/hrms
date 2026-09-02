import type { MiddlewareHandler } from "hono";

import type { UserRole, WorkspaceMemberRole } from "@/api/db/schema";
import type { AppEnv } from "@/api/lib/types";

export type MockAuthContext = {
  userId: string;
  userEmail: string;
  userRole: UserRole;
  workspaceId: string | null;
  // Workspace member role (from workspace_members table)
  workspaceRole?: WorkspaceMemberRole | null;
  // Platform-level super admin flag
  isSuperAdmin?: boolean;
  // Unix timestamp (ms) when email was verified; null means unverified
  // Defaults to a truthy value so tests representing verified users work without changes
  emailVerifiedAt?: number | null;
};

/**
 * Creates a mock auth middleware for testing
 * Sets auth context without actually verifying a JWT token
 */
export function mockAuth(authContext: MockAuthContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("userId", authContext.userId);
    c.set("userEmail", authContext.userEmail);
    c.set("userRole", authContext.userRole);
    c.set("workspaceId", authContext.workspaceId);
    // Set workspace role (defaults based on userRole for backwards compatibility)
    c.set("workspaceRole", "workspaceRole" in authContext
      ? authContext.workspaceRole
      : (authContext.userRole === "workspace_admin" ? "owner" : "user"));
    // Set isSuperAdmin (defaults to false)
    c.set("isSuperAdmin", authContext.isSuperAdmin ?? false);
    // Set emailVerifiedAt: defaults to a truthy timestamp so existing tests (representing verified users)
    // work without modification. Tests that need to simulate unverified users must explicitly pass null.
    c.set("emailVerifiedAt", "emailVerifiedAt" in authContext ? authContext.emailVerifiedAt : Date.now());
    await next();
  };
}

/**
 * Backwards-compatible alias for mockAuth
 * @deprecated Use mockAuth instead
 */
export const mockClerkAuth = mockAuth;

/**
 * Creates an unauthenticated mock middleware for testing
 * Returns 401 Unauthorized
 */
export function mockUnauthenticated(): MiddlewareHandler<AppEnv> {
  return async (c) => {
    return c.json({ message: "Unauthorized" }, 401);
  };
}
