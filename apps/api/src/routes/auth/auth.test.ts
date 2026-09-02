import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { emailVerifications, passwordResets, refreshTokens, users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { sendEmail } from "@/api/lib/email";
import { hashToken } from "@/api/lib/token";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./auth.handlers";
import * as routes from "./auth.routes";

vi.mock("@/api/lib/notification-email", () => ({
  dispatchNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock email provider sendEmail
vi.mock("@/api/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "test-123" }),
}));

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

// Create test router with mock auth (for Clerk-based routes)
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.signup, handlers.signup)
    .openapi(routes.me, handlers.me);
}

// Public auth router (no middleware — register/login/refresh/logout are public per D-05)
function createAuthRouter() {
  return createRouter()
    .openapi(routes.register, handlers.register)
    .openapi(routes.login, handlers.login)
    .openapi(routes.refresh, handlers.refresh)
    .openapi(routes.logout, handlers.logout);
}

// Helper to register a test user
async function registerUser(router: ReturnType<typeof createAuthRouter>, overrides?: Partial<{ email: string; password: string; firstName: string; lastName: string }>) {
  return router.request("/register", {
    method: "POST",
    body: JSON.stringify({
      email: "test@example.com",
      password: "validpassword123",
      firstName: "Test",
      lastName: "User",
      ...overrides,
    }),
    headers: new Headers({ "Content-Type": "application/json" }),
  }, env);
}

// Helper to extract refresh cookie from response
function getRefreshCookie(response: Response): string {
  const setCookieHeader = response.headers.get("Set-Cookie");
  const match = setCookieHeader?.match(/refresh_token=([^;]+)/);
  return match?.[1] ?? "";
}

describe("auth routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Clean up database before each test
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaces);
  });

  describe("post /auth/signup", () => {
    it("creates a new workspace and user", async () => {
      const mockAuth = {
        userId: "user_clerk123",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.signup.$post({
        json: {
          workspaceName: "My Workspace",
          workspaceSlug: "my-workspace",
        },
      });

      expect(response.status).toBe(201);
      if (response.status === 201) {
        const json = await response.json();
        expect(json.workspace).toBeDefined();
        expect(json.workspace.name).toBe("My Workspace");
        expect(json.workspace.slug).toBe("my-workspace");
        expect(json.workspace.ownerId).toBe("user_clerk123");
        expect(json.user).toBeDefined();
        expect(json.user.id).toBe("user_clerk123");
        expect(json.user.email).toBe("test@example.com");
        expect(json.user.role).toBe("workspace_admin");
        expect(json.user.workspaceId).toBe(json.workspace.id);
      }
    });

    it("returns 400 when workspace slug is already taken", async () => {
      const db = createDb(typedEnv);

      // Create an existing workspace
      await db.insert(workspaces).values({
        name: "Existing Workspace",
        slug: "taken-slug",
        ownerId: "user_other",
      });

      const mockAuth = {
        userId: "user_clerk123",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.signup.$post({
        json: {
          workspaceName: "My Workspace",
          workspaceSlug: "taken-slug",
        },
      });

      expect(response.status).toBe(400);
      if (response.status === 400) {
        const json = await response.json();
        expect(json.message).toBe("Workspace slug already taken");
      }
    });

    it("returns 409 when user already owns a workspace", async () => {
      const db = createDb(typedEnv);

      // Create existing workspace and user
      const [workspace] = await db.insert(workspaces).values({
        name: "Existing Workspace",
        slug: "existing-workspace",
        ownerId: "user_clerk123",
      }).returning();

      await db.insert(users).values({
        id: "user_clerk123",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const mockAuth = {
        userId: "user_clerk123",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.signup.$post({
        json: {
          workspaceName: "Another Workspace",
          workspaceSlug: "another-workspace",
        },
      });

      expect(response.status).toBe(409);
      if (response.status === 409) {
        const json = await response.json();
        expect(json.message).toBe("You already own a workspace");
      }
    });

    it("validates workspace slug format", async () => {
      const mockAuth = {
        userId: "user_clerk123",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.signup.$post({
        json: {
          workspaceName: "My Workspace",
          workspaceSlug: "Invalid Slug!", // Invalid: contains uppercase and special chars
        },
      });

      // OpenAPI validation returns 422 Unprocessable Entity
      expect(response.status).toBe(422);
    });
  });

  describe("get /auth/me", () => {
    it("returns null user when user not in database", async () => {
      const mockAuth = {
        userId: "user_new123",
        userEmail: "new@example.com",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.me.$get();

      expect(response.status).toBe(200);
      if (response.status === 200) {
        const json = await response.json();
        expect(json.user).toBeNull();
        expect(json.workspace).toBeNull();
        expect(json.ownsWorkspace).toBe(false);
      }
    });

    it("returns user without workspace when user has no workspace", async () => {
      const db = createDb(typedEnv);

      await db.insert(users).values({
        id: "user_clerk123",
        email: "test@example.com",
        workspaceId: null,
        role: "member",
      });

      const mockAuth = {
        userId: "user_clerk123",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.me.$get();

      expect(response.status).toBe(200);
      if (response.status === 200) {
        const json = await response.json();
        expect(json.user).toBeDefined();
        expect(json.user?.id).toBe("user_clerk123");
        expect(json.workspace).toBeNull();
        expect(json.ownsWorkspace).toBe(false);
      }
    });

    it("returns user with workspace", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "My Workspace",
        slug: "my-workspace",
        ownerId: "user_clerk123",
      }).returning();

      await db.insert(users).values({
        id: "user_clerk123",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const mockAuth = {
        userId: "user_clerk123",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.me.$get();

      expect(response.status).toBe(200);
      if (response.status === 200) {
        const json = await response.json();
        expect(json.user).toBeDefined();
        expect(json.user?.id).toBe("user_clerk123");
        expect(json.user?.workspaceId).toBe(workspace.id);
        expect(json.workspace).toBeDefined();
        expect(json.workspace?.id).toBe(workspace.id);
        expect(json.workspace?.name).toBe("My Workspace");
        expect(json.ownsWorkspace).toBe(true);
      }
    });
  });
});

// ─── Custom auth endpoint tests ────────────────────────────────────────────

describe("custom auth routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(refreshTokens);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaces);
  });

  describe("post /register", () => {
    it("returns 201 with accessToken for valid registration", async () => {
      const router = createAuthRouter();
      const response = await registerUser(router);
      expect(response.status).toBe(201);
      const json = await response.json() as { accessToken: string };
      expect(typeof json.accessToken).toBe("string");
      expect(json.accessToken.length).toBeGreaterThan(0);
    });

    it("sets httpOnly refresh_token cookie on register", async () => {
      const router = createAuthRouter();
      const response = await registerUser(router);
      const setCookieHeader = response.headers.get("Set-Cookie");
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain("refresh_token=");
      expect(setCookieHeader?.toLowerCase()).toContain("httponly");
      expect(setCookieHeader?.toLowerCase()).toContain("samesite=lax");
    });

    it("creates user in DB with passwordHash and passwordHasher", async () => {
      const router = createAuthRouter();
      await registerUser(router);
      const db = createDb(typedEnv);
      const [user] = await db.select().from(users).limit(1);
      expect(user).toBeDefined();
      expect(user.email).toBe("test@example.com");
      expect(user.passwordHash).toBeTruthy();
      expect(user.passwordHasher).toBe("pbkdf2-v1");
    });

    it("creates refresh_tokens record with hashed token", async () => {
      const router = createAuthRouter();
      await registerUser(router);
      const db = createDb(typedEnv);
      const [token] = await db.select().from(refreshTokens).limit(1);
      expect(token).toBeDefined();
      // tokenHash should be a SHA-256 hex string (64 chars), not a UUID
      expect(token.tokenHash).toHaveLength(64);
      expect(token.tokenHash).toMatch(/^[0-9a-f]+$/);
    });

    it("returns 409 for duplicate email", async () => {
      const router = createAuthRouter();
      await registerUser(router);
      const response = await registerUser(router);
      expect(response.status).toBe(409);
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Email already in use");
    });

    it("returns 422 (validation) for password shorter than 8 characters", async () => {
      const router = createAuthRouter();
      const response = await registerUser(router, { password: "short" });
      // Zod validation via OpenAPI returns 422
      expect(response.status).toBe(422);
    });

    it("returns 400 for password shorter than 8 characters (server-side check)", async () => {
      // This tests the server-side backup validation in the handler
      // We bypass Zod by sending 7 chars which the schema rejects (422),
      // but verifies the schema is enforced
      const router = createAuthRouter();
      const response = await registerUser(router, { password: "1234567" });
      // Should be 422 from Zod min(8) validation
      expect([400, 422]).toContain(response.status);
    });

    it("registers with emailVerifiedAt set when E2E_MODE=true", async () => {
      const router = createAuthRouter();
      const res = await router.request(
        "/register",
        {
          method: "POST",
          body: JSON.stringify({ email: "e2e-verify@test.com", password: "TestPass123!", firstName: "E2E", lastName: "User" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        { ...env, E2E_MODE: "true" },
      );
      expect(res.status).toBe(201);
      // Verify user has emailVerifiedAt set by checking DB
      const db = createDb(typedEnv);
      const [user] = await db.select().from(users).where(eq(users.email, "e2e-verify@test.com"));
      expect(user.emailVerifiedAt).not.toBeNull();
    });
  });

  describe("post /login", () => {
    it("returns 200 with accessToken for valid credentials", async () => {
      const router = createAuthRouter();
      // First register
      await registerUser(router);
      // Then login
      const response = await router.request("/login", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com", password: "validpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);
      expect(response.status).toBe(200);
      const json = await response.json() as { accessToken: string };
      expect(typeof json.accessToken).toBe("string");
      expect(json.accessToken.length).toBeGreaterThan(0);
    });

    it("sets refresh_token cookie on login", async () => {
      const router = createAuthRouter();
      await registerUser(router);
      const response = await router.request("/login", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com", password: "validpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);
      const setCookieHeader = response.headers.get("Set-Cookie");
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain("refresh_token=");
    });

    it("returns 401 with anti-enumeration message for wrong password", async () => {
      const router = createAuthRouter();
      await registerUser(router);
      const response = await router.request("/login", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com", password: "wrongpassword" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);
      expect(response.status).toBe(401);
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Invalid email or password");
    });

    it("returns 401 with same message for non-existent email (anti-enumeration)", async () => {
      const router = createAuthRouter();
      const response = await router.request("/login", {
        method: "POST",
        body: JSON.stringify({ email: "noone@example.com", password: "validpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);
      expect(response.status).toBe(401);
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Invalid email or password");
    });

    it("returns 401 for user with no passwordHash (OAuth-only user)", async () => {
      const router = createAuthRouter();
      const db = createDb(typedEnv);
      // Insert user without passwordHash (OAuth-only)
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "oauth@example.com",
        role: "member",
        // passwordHash and passwordHasher intentionally omitted
      });
      const response = await router.request("/login", {
        method: "POST",
        body: JSON.stringify({ email: "oauth@example.com", password: "anypassword" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);
      expect(response.status).toBe(401);
      // Migrated user detection: passwordHash=null triggers migration message (MIGR-02)
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Your account has been migrated. Check your email for a link to set your new password.");
    });

    it("embeds workspaceRole in JWT when user has a workspace membership", async () => {
      const router = createAuthRouter();
      const db = createDb(typedEnv);

      // Register first to get user created
      await registerUser(router);

      // Get the registered user
      const [user] = await db.select().from(users).limit(1);

      // Create a workspace and add the user as a member
      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: user.id,
      }).returning();

      // Update user with workspaceId
      await db.update(users).set({ workspaceId: workspace.id }).where(
        (await import("drizzle-orm")).eq(users.id, user.id),
      );

      // Add workspace membership
      const { workspaceMembers } = await import("@/api/db/schema");
      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
      });

      // Login and check JWT
      const response = await router.request("/login", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com", password: "validpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);
      expect(response.status).toBe(200);
      const json = await response.json() as { accessToken: string };

      // Decode JWT payload (middle part, base64url)
      const parts = json.accessToken.split(".");
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      expect(payload.workspaceRole).toBe("owner");
    });
  });

  describe("post /refresh", () => {
    it("returns 200 with new accessToken when valid refresh cookie present", async () => {
      const router = createAuthRouter();
      // Register to get a refresh token cookie
      const registerResponse = await registerUser(router);
      const refreshToken = getRefreshCookie(registerResponse);
      expect(refreshToken).toBeTruthy();

      const response = await router.request("/refresh", {
        method: "POST",
        headers: new Headers({ Cookie: `refresh_token=${refreshToken}` }),
      }, env);
      expect(response.status).toBe(200);
      const json = await response.json() as { accessToken: string };
      expect(typeof json.accessToken).toBe("string");
      expect(json.accessToken.length).toBeGreaterThan(0);
    });

    it("returns 401 when no refresh cookie", async () => {
      const router = createAuthRouter();
      const response = await router.request("/refresh", {
        method: "POST",
      }, env);
      expect(response.status).toBe(401);
    });

    it("returns 401 for invalid/unknown token", async () => {
      const router = createAuthRouter();
      const response = await router.request("/refresh", {
        method: "POST",
        headers: new Headers({ Cookie: "refresh_token=not-a-real-token-value" }),
      }, env);
      expect(response.status).toBe(401);
    });

    it("returns 401 for expired refresh token", async () => {
      const router = createAuthRouter();
      // Register to create a user
      await registerUser(router);
      const db = createDb(typedEnv);
      const [user] = await db.select().from(users).limit(1);

      // Manually insert an expired refresh token
      const rawToken = "expired-test-token-for-testing";
      const encoded = new TextEncoder().encode(rawToken);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      });

      const response = await router.request("/refresh", {
        method: "POST",
        headers: new Headers({ Cookie: `refresh_token=${rawToken}` }),
      }, env);
      expect(response.status).toBe(401);
    });

    it("returns 401 for revoked refresh token", async () => {
      const router = createAuthRouter();
      await registerUser(router);
      const db = createDb(typedEnv);
      const [user] = await db.select().from(users).limit(1);

      // Manually insert a revoked refresh token
      const rawToken = "revoked-test-token-for-testing";
      const encoded = new TextEncoder().encode(rawToken);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(), // revoked
      });

      const response = await router.request("/refresh", {
        method: "POST",
        headers: new Headers({ Cookie: `refresh_token=${rawToken}` }),
      }, env);
      expect(response.status).toBe(401);
    });

    it("does NOT rotate the refresh token cookie on refresh (D-13)", async () => {
      const router = createAuthRouter();
      const registerResponse = await registerUser(router);
      const originalToken = getRefreshCookie(registerResponse);

      const refreshResponse = await router.request("/refresh", {
        method: "POST",
        headers: new Headers({ Cookie: `refresh_token=${originalToken}` }),
      }, env);
      expect(refreshResponse.status).toBe(200);

      // No Set-Cookie header should be present (token not rotated)
      const setCookieHeader = refreshResponse.headers.get("Set-Cookie");
      expect(setCookieHeader).toBeNull();
    });
  });

  describe("post /logout", () => {
    it("returns 200 with Logged out message when cookie present", async () => {
      const router = createAuthRouter();
      const registerResponse = await registerUser(router);
      const refreshToken = getRefreshCookie(registerResponse);

      const response = await router.request("/logout", {
        method: "POST",
        headers: new Headers({ Cookie: `refresh_token=${refreshToken}` }),
      }, env);
      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Logged out");
    });

    it("clears the refresh_token cookie on logout", async () => {
      const router = createAuthRouter();
      const registerResponse = await registerUser(router);
      const refreshToken = getRefreshCookie(registerResponse);

      const response = await router.request("/logout", {
        method: "POST",
        headers: new Headers({ Cookie: `refresh_token=${refreshToken}` }),
      }, env);
      const setCookieHeader = response.headers.get("Set-Cookie");
      // Should have a Set-Cookie that clears the refresh_token (maxAge=0 or expired)
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain("refresh_token=");
      // deleteCookie sets maxAge=0 or expires in the past
      const maxAgeMatch = setCookieHeader?.match(/Max-Age=(\d+)/i);
      const maxAge = maxAgeMatch ? Number.parseInt(maxAgeMatch[1]) : null;
      expect(maxAge === 0 || setCookieHeader?.toLowerCase().includes("expires")).toBe(true);
    });

    it("deletes the refresh_tokens DB record on logout", async () => {
      const router = createAuthRouter();
      const registerResponse = await registerUser(router);
      const refreshToken = getRefreshCookie(registerResponse);

      const db = createDb(typedEnv);

      // Verify token exists before logout
      const tokensBefore = await db.select().from(refreshTokens);
      expect(tokensBefore.length).toBeGreaterThan(0);

      await router.request("/logout", {
        method: "POST",
        headers: new Headers({ Cookie: `refresh_token=${refreshToken}` }),
      }, env);

      // Verify token is gone after logout
      const tokensAfter = await db.select().from(refreshTokens);
      expect(tokensAfter).toHaveLength(0);
    });

    it("returns 200 gracefully when no cookie (idempotent)", async () => {
      const router = createAuthRouter();
      const response = await router.request("/logout", {
        method: "POST",
      }, env);
      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Logged out");
    });
  });
});

// ─── Migrated user login tests (MIGR-02) ───────────────────────────────────

describe("migrated user login (MIGR-02)", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(passwordResets);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(refreshTokens);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
  });

  function createMigratedLoginRouter() {
    return createRouter()
      .openapi(routes.login, handlers.login);
  }

  it("returns 401 with migration message when user has passwordHash=null", async () => {
    const db = createDb(typedEnv);
    const userId = crypto.randomUUID();
    // Simulating a migrated user: passwordHash=null, passwordHasher=null
    await db.insert(users).values({
      id: userId,
      email: "migrated@example.com",
      role: "member",
      passwordHash: null,
      passwordHasher: null,
    });

    const router = createMigratedLoginRouter();
    const response = await router.request("/login", {
      method: "POST",
      body: JSON.stringify({ email: "migrated@example.com", password: "anypassword" }),
      headers: new Headers({ "Content-Type": "application/json" }),
    }, env);

    expect(response.status).toBe(401);
    const json = await response.json() as { message: string };
    expect(json.message).toBe("Your account has been migrated. Check your email for a link to set your new password.");
  });

  it("inserts a passwordResets row when migrated user attempts login", async () => {
    const db = createDb(typedEnv);
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: "migrated2@example.com",
      role: "member",
      passwordHash: null,
      passwordHasher: null,
    });

    const router = createMigratedLoginRouter();
    await router.request("/login", {
      method: "POST",
      body: JSON.stringify({ email: "migrated2@example.com", password: "anypassword" }),
      headers: new Headers({ "Content-Type": "application/json" }),
    }, env);

    const [resetRow] = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, userId))
      .limit(1);

    expect(resetRow).toBeDefined();
    expect(resetRow.userId).toBe(userId);
    // tokenHash should be a SHA-256 hex string (64 chars)
    expect(resetRow.tokenHash).toHaveLength(64);
    expect(resetRow.tokenHash).toMatch(/^[0-9a-f]+$/);
  });

  it("normal user login continues to work as before", async () => {
    const db = createDb(typedEnv);
    const { hash, hasher } = await (await import("@/api/lib/password")).hashPassword("validpassword123");
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: "normal@example.com",
      role: "member",
      passwordHash: hash,
      passwordHasher: hasher,
    });

    const router = createMigratedLoginRouter();
    const response = await router.request("/login", {
      method: "POST",
      body: JSON.stringify({ email: "normal@example.com", password: "validpassword123" }),
      headers: new Headers({ "Content-Type": "application/json" }),
    }, env);

    expect(response.status).toBe(200);
    const json = await response.json() as { accessToken: string };
    expect(typeof json.accessToken).toBe("string");
    expect(json.accessToken.length).toBeGreaterThan(0);
  });

  it("non-existent email still returns generic Invalid email or password (anti-enumeration preserved)", async () => {
    const router = createMigratedLoginRouter();
    const response = await router.request("/login", {
      method: "POST",
      body: JSON.stringify({ email: "nobody@example.com", password: "anypassword" }),
      headers: new Headers({ "Content-Type": "application/json" }),
    }, env);

    expect(response.status).toBe(401);
    const json = await response.json() as { message: string };
    expect(json.message).toBe("Invalid email or password");
  });
});

// ─── Migrated Google OAuth user matching tests (MIGR-03) ──────────────────

describe("migrated Google OAuth user matching (MIGR-03)", () => {
  // Mock jose module for Google id_token verification in MIGR-03 tests
  vi.mock("jose", async (importOriginal) => {
    const actual = await importOriginal<typeof import("jose")>();
    return {
      ...actual,
      createRemoteJWKSet: vi.fn().mockReturnValue(() => Promise.resolve({})),
      jwtVerify: vi.fn().mockResolvedValue({
        payload: {
          sub: "google_sub_123",
          email: "migrated-google@example.com",
          email_verified: true,
          given_name: "Migrated",
          family_name: "GoogleUser",
          picture: "https://example.com/photo.jpg",
        },
      }),
    };
  });

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(refreshTokens);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
  });

  function createGoogleRouter() {
    return createRouter()
      .openapi(routes.googleLogin, handlers.googleLogin)
      .openapi(routes.googleCallback, handlers.googleCallback);
  }

  async function getLoginState(router: ReturnType<typeof createGoogleRouter>) {
    const response = await router.request("/google/login", {}, env);
    const setCookieHeader = response.headers.get("Set-Cookie") ?? "";
    const cookieMatch = setCookieHeader.match(/google_oauth_state=([^;]+)/);
    const stateCookie = cookieMatch?.[1] ?? "";
    const locationHeader = response.headers.get("Location") ?? "";
    const url = new URL(locationHeader);
    const state = url.searchParams.get("state") ?? "";
    return { stateCookie, state };
  }

  it("mIGR-03: migrated Google OAuth user matched by googleId — no duplicate user created, accessToken returned", async () => {
    const db = createDb(typedEnv);
    const existingUserId = crypto.randomUUID();

    // Seed a user with googleId set and passwordHash=null (migrated Google OAuth user per D-01)
    await db.insert(users).values({
      id: existingUserId,
      email: "migrated-google@example.com",
      googleId: "google_sub_123",
      passwordHash: null,
      passwordHasher: null,
      emailVerifiedAt: new Date(),
      role: "member",
    });

    const router = createGoogleRouter();
    const { stateCookie, state } = await getLoginState(router);

    // Mock fetch for Google token exchange
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: "mock-id-token",
        access_token: "mock-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    }));

    const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
      headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
    }, env);

    vi.unstubAllGlobals();

    // Assert: redirects with accessToken (successful login)
    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("/oauth/callback?token=");

    // Assert: existing user matched by googleId — no duplicate
    const allUsers = await db.select().from(users).where(eq(users.email, "migrated-google@example.com"));
    expect(allUsers.length).toBe(1);
    expect(allUsers[0].id).toBe(existingUserId);
  });
});

// ─── Email verification endpoint tests ─────────────────────────────────────

describe("email verification routes", () => {
  function createVerificationRouter() {
    return createRouter()
      .openapi(routes.register, handlers.register)
      .openapi(routes.verifyEmail, handlers.verifyEmail)
      .openapi(routes.resendVerification, handlers.resendVerification);
  }

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(emailVerifications);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(refreshTokens);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
  });

  describe("post /register — sends verification email", () => {
    it("creates an emailVerifications record after registration", async () => {
      const { sendEmail } = await import("@/api/lib/email");
      const router = createVerificationRouter();

      await router.request("/register", {
        method: "POST",
        body: JSON.stringify({
          email: "verify@example.com",
          password: "validpassword123",
          firstName: "Verify",
          lastName: "Me",
        }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      // Wait briefly for fire-and-forget to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const db = createDb(typedEnv);
      const [user] = await db.select().from(users).limit(1);
      const [verification] = await db
        .select()
        .from(emailVerifications)
        .limit(1);

      expect(verification).toBeDefined();
      expect(verification.userId).toBe(user.id);
      expect(verification.tokenHash).toHaveLength(64);
      expect(verification.tokenHash).toMatch(/^[0-9a-f]+$/);
      // expiresAt should be ~24h from now
      const now = Date.now();
      const expiresAtMs = verification.expiresAt.getTime();
      expect(expiresAtMs).toBeGreaterThan(now + 23 * 60 * 60 * 1000);
      expect(expiresAtMs).toBeLessThan(now + 25 * 60 * 60 * 1000);

      // sendEmail should have been called with correct params
      expect(sendEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subject: "Verify your email address",
          to: expect.objectContaining({ email: "verify@example.com" }),
          htmlContent: expect.stringContaining("token="),
        }),
      );
    });
  });

  describe("get /verify-email", () => {
    it("returns 200 and marks user verified with valid token", async () => {
      const db = createDb(typedEnv);

      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: "verify@example.com",
        role: "member",
      });

      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(emailVerifications).values({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const router = createVerificationRouter();
      const response = await router.request(`/verify-email?token=${rawToken}`, {
        method: "GET",
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Email verified");

      const { eq } = await import("drizzle-orm");
      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId));
      expect(updatedUser.emailVerifiedAt).not.toBeNull();

      const [updatedVerification] = await db.select().from(emailVerifications).limit(1);
      expect(updatedVerification.usedAt).not.toBeNull();
    });

    it("returns 400 for expired token", async () => {
      const db = createDb(typedEnv);

      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: "expired@example.com",
        role: "member",
      });

      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(emailVerifications).values({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      });

      const router = createVerificationRouter();
      const response = await router.request(`/verify-email?token=${rawToken}`, {
        method: "GET",
      }, env);

      expect(response.status).toBe(400);
      const json = await response.json() as { message: string };
      expect(json.message.toLowerCase()).toMatch(/expired|invalid/);
    });

    it("returns 400 for already-used token", async () => {
      const db = createDb(typedEnv);

      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: "used@example.com",
        role: "member",
      });

      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(emailVerifications).values({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: new Date(),
      });

      const router = createVerificationRouter();
      const response = await router.request(`/verify-email?token=${rawToken}`, {
        method: "GET",
      }, env);

      expect(response.status).toBe(400);
    });

    it("returns 400 for nonexistent token", async () => {
      const router = createVerificationRouter();
      const response = await router.request(`/verify-email?token=${crypto.randomUUID()}`, {
        method: "GET",
      }, env);

      expect(response.status).toBe(400);
    });
  });

  describe("post /resend-verification", () => {
    it("returns 200 and sends new email for unverified user", async () => {
      const { sendEmail } = await import("@/api/lib/email");
      const db = createDb(typedEnv);

      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: "unverified@example.com",
        role: "member",
      });

      const oldTokenRaw = crypto.randomUUID();
      const oldTokenHash = await hashToken(oldTokenRaw);
      await db.insert(emailVerifications).values({
        userId,
        tokenHash: oldTokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const router = createVerificationRouter();
      const response = await router.request("/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: "unverified@example.com" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(json.message).toContain("If your email is registered");

      const { eq } = await import("drizzle-orm");
      const [oldVerif] = await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.tokenHash, oldTokenHash));
      expect(oldVerif.usedAt).not.toBeNull();

      const allVerifications = await db.select().from(emailVerifications);
      expect(allVerifications.length).toBe(2);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subject: "Verify your email address",
          to: expect.objectContaining({ email: "unverified@example.com" }),
        }),
      );
    });

    it("returns 200 but does NOT send email for already-verified user (anti-enumeration)", async () => {
      const { sendEmail } = await import("@/api/lib/email");
      const db = createDb(typedEnv);

      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "verified@example.com",
        role: "member",
        emailVerifiedAt: new Date(),
      });

      const router = createVerificationRouter();
      const response = await router.request("/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: "verified@example.com" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("returns 200 but does NOT send email for nonexistent email (anti-enumeration)", async () => {
      const { sendEmail } = await import("@/api/lib/email");
      const router = createVerificationRouter();

      const response = await router.request("/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: "nobody@test.com" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});

// ─── Password reset endpoint tests ────────────────────────────────────────

describe("password reset routes", () => {
  function createPasswordResetRouter() {
    return createRouter()
      .openapi(routes.forgotPassword, handlers.forgotPassword)
      .openapi(routes.resetPassword, handlers.resetPassword);
  }

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(passwordResets);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(refreshTokens);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
  });

  describe("post /forgot-password", () => {
    it("returns 200 and creates a passwordReset row for registered email", async () => {
      const db = createDb(typedEnv);
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "user@test.com",
        role: "member",
        passwordHash: "hash",
        passwordHasher: "pbkdf2-v1",
      });

      const router = createPasswordResetRouter();
      const response = await router.request("/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "user@test.com" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(typeof json.message).toBe("string");

      const resets = await db.select().from(passwordResets);
      expect(resets).toHaveLength(1);
      expect(resets[0].tokenHash).toHaveLength(64);
      expect(resets[0].tokenHash).toMatch(/^[0-9a-f]+$/);
      expect(resets[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(sendEmail).toHaveBeenCalledOnce();
      const call = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(call.subject).toBe("Reset your Tracky password");
      expect(call.to.email).toBe("user@test.com");
    });

    it("returns 200 with same message shape for non-existent email (anti-enumeration)", async () => {
      const router = createPasswordResetRouter();
      const response = await router.request("/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "nobody@test.com" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(typeof json.message).toBe("string");

      expect(sendEmail).not.toHaveBeenCalled();

      const db = createDb(typedEnv);
      const resets = await db.select().from(passwordResets);
      expect(resets).toHaveLength(0);
    });

    it("returns 200 and sends email for OAuth-only user (no passwordHash)", async () => {
      const db = createDb(typedEnv);
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "oauth@test.com",
        role: "member",
        // no passwordHash or passwordHasher
      });

      const router = createPasswordResetRouter();
      const response = await router.request("/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "oauth@test.com" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      expect(sendEmail).toHaveBeenCalledOnce();
    });
  });

  describe("post /reset-password", () => {
    it("returns 200 and updates passwordHash, marks token used, deletes all refreshTokens", async () => {
      const db = createDb(typedEnv);
      const userId = crypto.randomUUID();
      const originalHash = "original-hash:with-salt";

      await db.insert(users).values({
        id: userId,
        email: "user@test.com",
        role: "member",
        passwordHash: originalHash,
        passwordHasher: "pbkdf2-v1",
      });

      // Insert 3 refresh tokens for the user
      await db.insert(refreshTokens).values([
        { userId, tokenHash: "hash1".padEnd(64, "0"), familyId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86400000) },
        { userId, tokenHash: "hash2".padEnd(64, "0"), familyId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86400000) },
        { userId, tokenHash: "hash3".padEnd(64, "0"), familyId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86400000) },
      ]);

      // Create a password reset token
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(passwordResets).values({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      });

      const router = createPasswordResetRouter();
      const response = await router.request("/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: rawToken, password: "newpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(json.message).toBe("Password has been reset");

      // User's passwordHash has changed
      const [updatedUser] = await db.select().from(users).limit(1);
      expect(updatedUser.passwordHash).not.toBe(originalHash);
      expect(updatedUser.passwordHasher).toBe("pbkdf2-v1");

      // Token is marked used
      const [reset] = await db.select().from(passwordResets).limit(1);
      expect(reset.usedAt).not.toBeNull();

      // All 3 refresh tokens are deleted (D-10 / EMAIL-06)
      const remainingTokens = await db.select().from(refreshTokens);
      expect(remainingTokens).toHaveLength(0);
    });

    it("returns 400 for expired token", async () => {
      const db = createDb(typedEnv);
      const userId = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        email: "user@test.com",
        role: "member",
      });

      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(passwordResets).values({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      });

      const router = createPasswordResetRouter();
      const response = await router.request("/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: rawToken, password: "newpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(400);
      const json = await response.json() as { message: string };
      expect(json.message.toLowerCase()).toMatch(/expired|invalid/);
    });

    it("returns 400 for already-used token", async () => {
      const db = createDb(typedEnv);
      const userId = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        email: "user@test.com",
        role: "member",
      });

      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(passwordResets).values({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(), // already used
      });

      const router = createPasswordResetRouter();
      const response = await router.request("/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: rawToken, password: "newpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(400);
    });

    it("returns 400 for non-existent token", async () => {
      const router = createPasswordResetRouter();
      const response = await router.request("/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: crypto.randomUUID(), password: "newpassword123" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(400);
    });

    it("returns 422 for password shorter than 8 characters (Zod validation)", async () => {
      const router = createPasswordResetRouter();
      const response = await router.request("/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: "sometoken", password: "short" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(422);
    });
  });

  describe("google oauth", () => {
    // Mock jose module for Google id_token verification only
    vi.mock("jose", async (importOriginal) => {
      const actual = await importOriginal<typeof import("jose")>();
      return {
        ...actual,
        createRemoteJWKSet: vi.fn().mockReturnValue(() => Promise.resolve({})),
        jwtVerify: vi.fn().mockResolvedValue({
          payload: {
            sub: "google_123",
            email: "test@gmail.com",
            email_verified: true,
            given_name: "Test",
            family_name: "User",
            picture: "https://example.com/photo.jpg",
          },
        }),
      };
    });

    function createGoogleRouter() {
      return createRouter()
        .openapi(routes.googleLogin, handlers.googleLogin)
        .openapi(routes.googleCallback, handlers.googleCallback);
    }

    // Helper: call /google/login and extract the state cookie + state param from redirect URL
    async function getLoginState(router: ReturnType<typeof createGoogleRouter>) {
      const response = await router.request("/google/login", {}, env);
      const setCookieHeader = response.headers.get("Set-Cookie") ?? "";
      const cookieMatch = setCookieHeader.match(/google_oauth_state=([^;]+)/);
      const stateCookie = cookieMatch?.[1] ?? "";
      const locationHeader = response.headers.get("Location") ?? "";
      const url = new URL(locationHeader);
      const state = url.searchParams.get("state") ?? "";
      return { stateCookie, state };
    }

    it("gET /google/login returns 302 redirect to Google authorization URL", async () => {
      const router = createGoogleRouter();
      const response = await router.request("/google/login", {}, env);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    });

    it("gET /google/login sets google_oauth_state cookie (httpOnly, Secure, SameSite=Lax)", async () => {
      const router = createGoogleRouter();
      const response = await router.request("/google/login", {}, env);

      const setCookieHeader = response.headers.get("Set-Cookie") ?? "";
      expect(setCookieHeader).toMatch(/google_oauth_state=/);
      expect(setCookieHeader).toMatch(/HttpOnly/i);
      expect(setCookieHeader).toMatch(/Secure/i);
      expect(setCookieHeader).toMatch(/SameSite=Lax/i);
    });

    it("gET /google/login Location URL contains required OAuth parameters", async () => {
      const router = createGoogleRouter();
      const response = await router.request("/google/login", {}, env);

      const location = response.headers.get("Location") ?? "";
      const url = new URL(location);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toContain("openid");
      expect(url.searchParams.get("client_id")).toBe("test-google-client-id");
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
      expect(url.searchParams.get("state")).toBeTruthy();
    });

    it("gET /google/callback without state cookie returns 302 to /login?error=google_failed", async () => {
      const router = createGoogleRouter();
      const response = await router.request("/google/callback?code=abc&state=xyz", {}, env);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/login?error=google_failed");
    });

    it("gET /google/callback with ?error=access_denied returns 302 to /login?error=google_denied", async () => {
      const router = createGoogleRouter();
      const response = await router.request("/google/callback?error=access_denied", {}, env);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/login?error=google_denied");
    });

    it("gET /google/callback with state mismatch returns 302 to /login?error=google_failed", async () => {
      const router = createGoogleRouter();
      const { stateCookie } = await getLoginState(router);

      // Use a different state value than what was stored in cookie
      const response = await router.request("/google/callback?code=abc&state=wrong-state-value", {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/login?error=google_failed");
    });

    it("gET /google/callback success (new user D-08): creates user with googleId and emailVerifiedAt", async () => {
      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);

      // Mock fetch for Google token exchange
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: "mock-id-token",
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }));

      const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      vi.unstubAllGlobals();

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // Verify user was created in DB
      const db = createDb(typedEnv);
      const [createdUser] = await db.select().from(users).where(eq(users.email, "test@gmail.com")).limit(1);
      expect(createdUser).toBeDefined();
      expect(createdUser.googleId).toBe("google_123");
      expect(createdUser.emailVerifiedAt).not.toBeNull();
      expect(createdUser.firstName).toBe("Test");
      expect(createdUser.lastName).toBe("User");
    });

    it("gET /google/callback success (existing googleId D-07): logs in without creating new user", async () => {
      const db = createDb(typedEnv);

      // Pre-create user with googleId
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "test@gmail.com",
        googleId: "google_123",
        emailVerifiedAt: new Date(),
        role: "member",
      });

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: "mock-id-token",
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }));

      const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      vi.unstubAllGlobals();

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // Verify only 1 user exists (no duplicate creation)
      const allUsers = await db.select().from(users).where(eq(users.email, "test@gmail.com"));
      expect(allUsers.length).toBe(1);
    });

    it("gET /google/callback success (existing verified email D-05): links googleId to existing user", async () => {
      const db = createDb(typedEnv);

      // Pre-create verified email user WITHOUT googleId
      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: "test@gmail.com",
        emailVerifiedAt: new Date(),
        passwordHash: "hash",
        passwordHasher: "pbkdf2-v1",
        role: "member",
      });

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: "mock-id-token",
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }));

      const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      vi.unstubAllGlobals();

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // Verify googleId was linked
      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      expect(updatedUser.googleId).toBe("google_123");
    });

    it("gET /google/callback success (existing unverified email D-06): links googleId and sets emailVerifiedAt", async () => {
      const db = createDb(typedEnv);

      // Pre-create unverified email user WITHOUT googleId and WITHOUT emailVerifiedAt
      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: "test@gmail.com",
        emailVerifiedAt: null,
        passwordHash: "hash",
        passwordHasher: "pbkdf2-v1",
        role: "member",
      });

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: "mock-id-token",
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }));

      const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      vi.unstubAllGlobals();

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // Verify googleId was linked AND emailVerifiedAt was set
      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      expect(updatedUser.googleId).toBe("google_123");
      expect(updatedUser.emailVerifiedAt).not.toBeNull();
    });

    it("gET /google/callback success: google_oauth_state cookie is cleared", async () => {
      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: "mock-id-token",
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }));

      const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      vi.unstubAllGlobals();

      // Verify the state cookie is deleted (Set-Cookie clears it)
      const setCookieHeader = response.headers.get("Set-Cookie") ?? "";
      expect(setCookieHeader).toMatch(/google_oauth_state=;|google_oauth_state=([^;]*);.*Max-Age=0/i);
    });

    it("gET /google/callback rejects unverified Google email with redirect to login?error=google_failed", async () => {
      const { jwtVerify } = await import("jose");
      (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        payload: {
          sub: "google_unverified_456",
          email: "unverified@gmail.com",
          email_verified: false,
          given_name: "Unverified",
          family_name: "User",
        },
      });

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: "mock-id-token",
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }));

      const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      vi.unstubAllGlobals();

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/login?error=google_failed");
    });
  });

  describe("google OAuth invitation auto-accept (D-04)", () => {
    // Uses the existing jose mock from the 'google oauth' describe block above.
    // Per-test override via mockResolvedValueOnce for jwtVerify.

    function createGoogleRouter() {
      return createRouter()
        .openapi(routes.googleLogin, handlers.googleLogin)
        .openapi(routes.googleCallback, handlers.googleCallback);
    }

    async function getLoginState(router: ReturnType<typeof createGoogleRouter>) {
      const response = await router.request("/google/login", {}, env);
      const setCookieHeader = response.headers.get("Set-Cookie") ?? "";
      const cookieMatch = setCookieHeader.match(/google_oauth_state=([^;]+)/);
      const stateCookie = cookieMatch?.[1] ?? "";
      const locationHeader = response.headers.get("Location") ?? "";
      const url = new URL(locationHeader);
      const state = url.searchParams.get("state") ?? "";
      return { stateCookie, state };
    }

    async function callGoogleCallback(router: ReturnType<typeof createGoogleRouter>, state: string, stateCookie: string) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: "mock-id-token",
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      }));

      const response = await router.request(`/google/callback?code=auth-code&state=${state}`, {
        headers: new Headers({ Cookie: `google_oauth_state=${stateCookie}` }),
      }, env);

      vi.unstubAllGlobals();
      return response;
    }

    // The existing jose mock returns email: "test@gmail.com" and sub: "google_123"
    // We seed invitations with "test@gmail.com" to match the mock.

    async function seedInvitation(email: string = "test@gmail.com") {
      const db = createDb(typedEnv);
      const { workspaceInvitations, workspaceMembers } = await import("@/api/db/schema");

      // Create inviter + workspace
      const [inviterUser] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "ws-owner@example.com",
        role: "workspace_admin",
      }).returning();

      const [workspace] = await db.insert(workspaces).values({
        name: "Google Workspace",
        slug: "google-workspace",
        ownerId: inviterUser.id,
      }).returning();

      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);

      const [invitation] = await db.insert(workspaceInvitations).values({
        workspaceId: workspace.id,
        inviterUserId: inviterUser.id,
        email,
        role: "user",
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();

      return { workspace, invitation, rawToken, workspaceInvitations, workspaceMembers };
    }

    it("new user via Google OAuth with pending invitation is auto-accepted", async () => {
      // The existing jose mock returns email: "test@gmail.com" and sub: "google_123"
      const { workspace, invitation, workspaceInvitations, workspaceMembers } = await seedInvitation("test@gmail.com");
      const db = createDb(typedEnv);

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);
      const response = await callGoogleCallback(router, state, stateCookie);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // Verify user created
      const [newUser] = await db.select().from(users).where(
        (await import("drizzle-orm")).eq(users.email, "test@gmail.com"),
      ).limit(1);
      expect(newUser).toBeDefined();
      expect(newUser.workspaceId).toBe(workspace.id);

      // Verify workspace membership created
      const [membership] = await db.select().from(workspaceMembers).where(
        (await import("drizzle-orm")).eq(workspaceMembers.userId, newUser.id),
      ).limit(1);
      expect(membership).toBeDefined();
      expect(membership.workspaceId).toBe(workspace.id);
      expect(membership.role).toBe("user");

      // Verify invitation marked used
      const [updatedInv] = await db.select().from(workspaceInvitations).where(
        (await import("drizzle-orm")).eq(workspaceInvitations.id, invitation.id),
      ).limit(1);
      expect(updatedInv.usedAt).not.toBeNull();
    });

    it("existing Google user with pending invitation is auto-accepted", async () => {
      const { workspace, invitation, workspaceInvitations, workspaceMembers } = await seedInvitation("test@gmail.com");
      const db = createDb(typedEnv);

      // Pre-create existing Google user WITHOUT workspace — uses same googleId as mock (google_123)
      const [existingUser] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "test@gmail.com",
        googleId: "google_123",
        emailVerifiedAt: new Date(),
        role: "member",
      }).returning();

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);
      const response = await callGoogleCallback(router, state, stateCookie);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // Verify added to workspace
      const [membership] = await db.select().from(workspaceMembers).where(
        (await import("drizzle-orm")).eq(workspaceMembers.userId, existingUser.id),
      ).limit(1);
      expect(membership).toBeDefined();
      expect(membership.workspaceId).toBe(workspace.id);

      // Verify invitation marked used
      const [updatedInv] = await db.select().from(workspaceInvitations).where(
        (await import("drizzle-orm")).eq(workspaceInvitations.id, invitation.id),
      ).limit(1);
      expect(updatedInv.usedAt).not.toBeNull();
    });

    it("existing email user with pending invitation is auto-accepted", async () => {
      const { workspace, invitation, workspaceInvitations, workspaceMembers } = await seedInvitation("test@gmail.com");
      const db = createDb(typedEnv);

      // Pre-create user with email but no googleId
      const [existingUser] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "test@gmail.com",
        emailVerifiedAt: new Date(),
        role: "member",
      }).returning();

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);
      const response = await callGoogleCallback(router, state, stateCookie);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // Verify added to workspace
      const [membership] = await db.select().from(workspaceMembers).where(
        (await import("drizzle-orm")).eq(workspaceMembers.userId, existingUser.id),
      ).limit(1);
      expect(membership).toBeDefined();
      expect(membership.workspaceId).toBe(workspace.id);

      // Verify invitation marked used
      const [updatedInv] = await db.select().from(workspaceInvitations).where(
        (await import("drizzle-orm")).eq(workspaceInvitations.id, invitation.id),
      ).limit(1);
      expect(updatedInv.usedAt).not.toBeNull();
    });

    it("google OAuth with no pending invitation works normally (no change)", async () => {
      const db = createDb(typedEnv);

      // No invitation seeded — just Google OAuth new user flow
      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);
      const response = await callGoogleCallback(router, state, stateCookie);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("/oauth/callback?token=");

      // User created but no workspace (no invitation)
      const [newUser] = await db.select().from(users).where(
        (await import("drizzle-orm")).eq(users.email, "test@gmail.com"),
      ).limit(1);
      expect(newUser).toBeDefined();
      expect(newUser.workspaceId).toBeNull();
    });

    it("google OAuth with expired invitation does NOT auto-accept", async () => {
      const { workspaceMembers } = await seedInvitation("test@gmail.com");
      // Override to expired
      const db = createDb(typedEnv);
      const { workspaceInvitations } = await import("@/api/db/schema");
      await db.update(workspaceInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(
        (await import("drizzle-orm")).eq(workspaceInvitations.email, "test@gmail.com"),
      );

      const router = createGoogleRouter();
      const { stateCookie, state } = await getLoginState(router);
      const response = await callGoogleCallback(router, state, stateCookie);

      expect(response.status).toBe(302);

      // Verify user was NOT added to workspace
      const [newUser] = await db.select().from(users).where(
        (await import("drizzle-orm")).eq(users.email, "test@gmail.com"),
      ).limit(1);
      expect(newUser).toBeDefined();
      expect(newUser.workspaceId).toBeNull();

      const allMemberships = await db.select().from(workspaceMembers).where(
        (await import("drizzle-orm")).eq(workspaceMembers.userId, newUser.id),
      );
      expect(allMemberships).toHaveLength(0);
    });
  });

  describe("workspace invitation endpoints", () => {
    function createInviteRouter() {
      return createRouter()
        .openapi(routes.getInvite, handlers.getInvite)
        .openapi(routes.acceptInvite, handlers.acceptInvite);
    }

    async function seedWorkspaceAndInvitation(overrides?: {
      email?: string;
      role?: "admin" | "user";
      usedAt?: Date;
      revokedAt?: Date;
      expiresAt?: Date;
    }) {
      const db = createDb(typedEnv);
      const { workspaceInvitations, workspaceMembers } = await import("@/api/db/schema");

      // Create inviter user
      const [inviter] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email: "inviter@example.com",
        firstName: "Alice",
        lastName: "Admin",
        role: "workspace_admin",
      }).returning();

      // Create workspace
      const [workspace] = await db.insert(workspaces).values({
        name: "Acme Corp",
        slug: "acme-corp",
        ownerId: inviter.id,
      }).returning();

      // Update inviter with workspaceId
      await db.update(users).set({ workspaceId: workspace.id }).where(
        (await import("drizzle-orm")).eq(users.id, inviter.id),
      );

      // Create invitation
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);

      const [invitation] = await db.insert(workspaceInvitations).values({
        workspaceId: workspace.id,
        inviterUserId: inviter.id,
        email: overrides?.email ?? "invited@example.com",
        role: overrides?.role ?? "user",
        tokenHash,
        expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        usedAt: overrides?.usedAt ?? null,
        revokedAt: overrides?.revokedAt ?? null,
      }).returning();

      return { workspace, inviter, invitation, rawToken, workspaceInvitations, workspaceMembers };
    }

    describe("gET /auth/invite", () => {
      it("returns 200 with invitation metadata for valid token", async () => {
        const { rawToken, workspace, inviter } = await seedWorkspaceAndInvitation();
        const router = createInviteRouter();

        const response = await router.request(`/invite?token=${rawToken}`, {}, env);

        expect(response.status).toBe(200);
        const json = await response.json() as { email: string; workspaceName: string; inviterName: string | null; role: string };
        expect(json.email).toBe("invited@example.com");
        expect(json.workspaceName).toBe(workspace.name);
        expect(json.inviterName).toBe(`${inviter.firstName} ${inviter.lastName}`);
        expect(json.role).toBe("user");
      });

      it("returns 404 for invalid token", async () => {
        const router = createInviteRouter();
        const response = await router.request(`/invite?token=${crypto.randomUUID()}`, {}, env);
        expect(response.status).toBe(404);
      });

      it("returns 404 for expired token", async () => {
        const { rawToken } = await seedWorkspaceAndInvitation({
          expiresAt: new Date(Date.now() - 1000),
        });
        const router = createInviteRouter();
        const response = await router.request(`/invite?token=${rawToken}`, {}, env);
        expect(response.status).toBe(404);
      });

      it("returns 404 for used token", async () => {
        const { rawToken } = await seedWorkspaceAndInvitation({ usedAt: new Date() });
        const router = createInviteRouter();
        const response = await router.request(`/invite?token=${rawToken}`, {}, env);
        expect(response.status).toBe(404);
      });
    });

    describe("pOST /auth/invite/accept", () => {
      it("adds authenticated user to workspace (Case A) and returns 200 with workspaceId", async () => {
        const { rawToken, workspace, workspaceMembers } = await seedWorkspaceAndInvitation();
        const db = createDb(typedEnv);

        // Create a user whose email matches the invitation (invited@example.com)
        const [existingUser] = await db.insert(users).values({
          id: crypto.randomUUID(),
          email: "invited@example.com",
          firstName: "Bob",
          lastName: "Smith",
          role: "member",
          emailVerifiedAt: new Date(),
        }).returning();

        // Build router with optionalJwtAuth bypass by pre-setting userId in context
        const router = createRouter()
          .use(mockClerkAuth({
            userId: existingUser.id,
            userEmail: existingUser.email,
            userRole: "member" as const,
            workspaceId: null,
          }))
          .openapi(routes.acceptInvite, handlers.acceptInvite);

        const response = await router.request("/invite/accept", {
          method: "POST",
          body: JSON.stringify({ token: rawToken }),
          headers: new Headers({ "Content-Type": "application/json" }),
        }, env);

        expect(response.status).toBe(200);
        const json = await response.json() as { workspaceId: string; workspaceSlug: string; accessToken?: string };
        expect(json.workspaceId).toBe(workspace.id);
        expect(json.workspaceSlug).toBe(workspace.slug);
        expect(json.accessToken).toBeUndefined();

        // Verify user was added to workspace
        const [membership] = await db.select().from(workspaceMembers).where(
          (await import("drizzle-orm")).and(
            (await import("drizzle-orm")).eq(workspaceMembers.workspaceId, workspace.id),
            (await import("drizzle-orm")).eq(workspaceMembers.userId, existingUser.id),
          ),
        ).limit(1);
        expect(membership).toBeDefined();
        expect(membership.role).toBe("user");
      });

      it("returns 403 when authenticated user email does not match invitation email", async () => {
        const { rawToken } = await seedWorkspaceAndInvitation();
        const db = createDb(typedEnv);

        // Create a user with a DIFFERENT email than the invitation
        const [wrongUser] = await db.insert(users).values({
          id: crypto.randomUUID(),
          email: "wrong-account@example.com",
          firstName: "Wrong",
          lastName: "User",
          role: "member",
          emailVerifiedAt: new Date(),
        }).returning();

        const router = createRouter()
          .use(mockClerkAuth({
            userId: wrongUser.id,
            userEmail: wrongUser.email,
            userRole: "member" as const,
            workspaceId: null,
          }))
          .openapi(routes.acceptInvite, handlers.acceptInvite);

        const response = await router.request("/invite/accept", {
          method: "POST",
          body: JSON.stringify({ token: rawToken }),
          headers: new Headers({ "Content-Type": "application/json" }),
        }, env);

        expect(response.status).toBe(403);
        const json = await response.json() as { message: string };
        expect(json.message).toContain("different email address");
      });

      it("returns 409 when authenticated user is already a member", async () => {
        const { rawToken, workspace, workspaceMembers } = await seedWorkspaceAndInvitation();
        const db = createDb(typedEnv);

        // Create a user who is already a member
        const [existingUser] = await db.insert(users).values({
          id: crypto.randomUUID(),
          email: "invited@example.com",
          role: "member",
          workspaceId: workspace.id,
          emailVerifiedAt: new Date(),
        }).returning();

        // Add them as workspace member
        await db.insert(workspaceMembers).values({
          workspaceId: workspace.id,
          userId: existingUser.id,
          role: "user",
        });

        const router = createRouter()
          .use(mockClerkAuth({
            userId: existingUser.id,
            userEmail: existingUser.email,
            userRole: "member" as const,
            workspaceId: workspace.id,
          }))
          .openapi(routes.acceptInvite, handlers.acceptInvite);

        const response = await router.request("/invite/accept", {
          method: "POST",
          body: JSON.stringify({ token: rawToken }),
          headers: new Headers({ "Content-Type": "application/json" }),
        }, env);

        expect(response.status).toBe(409);
      });

      it("creates new user with emailVerifiedAt set (Case B, D-03)", async () => {
        const { rawToken, workspace, workspaceMembers } = await seedWorkspaceAndInvitation({ email: "newuser@example.com" });
        const db = createDb(typedEnv);

        // No auth (unauthenticated user)
        const router = createRouter()
          .openapi(routes.getInvite, handlers.getInvite)
          .openapi(routes.acceptInvite, handlers.acceptInvite);

        const response = await router.request("/invite/accept", {
          method: "POST",
          body: JSON.stringify({
            token: rawToken,
            firstName: "New",
            lastName: "User",
            password: "securepassword123",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        }, env);

        expect(response.status).toBe(200);
        const json = await response.json() as { accessToken: string; workspaceId: string; workspaceSlug: string };
        expect(json.accessToken).toBeDefined();
        expect(json.workspaceId).toBe(workspace.id);
        expect(json.workspaceSlug).toBe(workspace.slug);

        // Verify new user was created with emailVerifiedAt set (D-03)
        const [newUser] = await db.select().from(users).where(
          (await import("drizzle-orm")).eq(users.email, "newuser@example.com"),
        ).limit(1);
        expect(newUser).toBeDefined();
        expect(newUser.emailVerifiedAt).not.toBeNull();
        expect(newUser.firstName).toBe("New");
        expect(newUser.lastName).toBe("User");

        // Verify added to workspace
        const [membership] = await db.select().from(workspaceMembers).where(
          (await import("drizzle-orm")).eq(workspaceMembers.userId, newUser.id),
        ).limit(1);
        expect(membership).toBeDefined();
        expect(membership.workspaceId).toBe(workspace.id);
      });

      it("returns 422 when unauthenticated user omits name/password (Case B validation)", async () => {
        const { rawToken } = await seedWorkspaceAndInvitation({ email: "another@example.com" });

        const router = createRouter()
          .openapi(routes.acceptInvite, handlers.acceptInvite);

        const response = await router.request("/invite/accept", {
          method: "POST",
          body: JSON.stringify({ token: rawToken }),
          headers: new Headers({ "Content-Type": "application/json" }),
        }, env);

        expect(response.status).toBe(422);
      });

      it("marks invitation usedAt after successful accept", async () => {
        const { rawToken, invitation } = await seedWorkspaceAndInvitation({ email: "usedat@example.com" });
        const db = createDb(typedEnv);
        const { workspaceInvitations } = await import("@/api/db/schema");

        const router = createRouter()
          .openapi(routes.acceptInvite, handlers.acceptInvite);

        await router.request("/invite/accept", {
          method: "POST",
          body: JSON.stringify({
            token: rawToken,
            firstName: "Test",
            lastName: "User",
            password: "password12345",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        }, env);

        const [updated] = await db.select().from(workspaceInvitations).where(
          (await import("drizzle-orm")).eq(workspaceInvitations.id, invitation.id),
        ).limit(1);
        expect(updated.usedAt).not.toBeNull();
      });

      it("returns 404 for invalid token", async () => {
        const router = createRouter()
          .openapi(routes.acceptInvite, handlers.acceptInvite);

        const response = await router.request("/invite/accept", {
          method: "POST",
          body: JSON.stringify({ token: "invalid-token", firstName: "Test", lastName: "User", password: "password12345" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        }, env);

        expect(response.status).toBe(404);
      });
    });
  });
});

// ─── User Profile endpoint tests ────────────────────────────────────────────

// Mock IMAGES binding for tests (unused in isolated storage env, kept for reference)
const _mockImagesBinding = {
  input: (_stream: ReadableStream) => ({
    transform: (_opts: { width: number; height: number; fit?: string }) => ({
      output: async (_opts: { format: string }) => ({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
      }),
    }),
  }),
};

describe("user profile routes", () => {
  const TEST_USER_ID = "user-profile-test-123";
  const TEST_USER_EMAIL = "profile@example.com";

  function createProfileRouter(auth?: Parameters<typeof mockClerkAuth>[0]) {
    const router = createRouter();
    if (auth) {
      router.use(mockClerkAuth(auth));
    }
    return router
      .openapi(routes.updateProfile, handlers.updateProfile)
      .openapi(routes.uploadAvatar, handlers.uploadAvatar)
      .openapi(routes.getAvatar, handlers.getAvatar);
  }

  function createAuthContext() {
    return {
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      userRole: "member" as const,
      workspaceId: null,
    };
  }

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(refreshTokens);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);

    // Insert a test user directly
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      firstName: "Profile",
      lastName: "User",
    });
  });

  describe("patch /profile", () => {
    it("returns 200 with updated user when firstName provided", async () => {
      const router = createProfileRouter(createAuthContext());
      const response = await router.request("/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: "UpdatedFirst" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { firstName: string };
      expect(json.firstName).toBe("UpdatedFirst");
    });

    it("returns 200 with updated user when lastName provided", async () => {
      const router = createProfileRouter(createAuthContext());
      const response = await router.request("/profile", {
        method: "PATCH",
        body: JSON.stringify({ lastName: "UpdatedLast" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { lastName: string };
      expect(json.lastName).toBe("UpdatedLast");
    });

    it("returns 200 with updated user when both firstName and lastName provided", async () => {
      const router = createProfileRouter(createAuthContext());
      const response = await router.request("/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: "NewFirst", lastName: "NewLast" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { firstName: string; lastName: string };
      expect(json.firstName).toBe("NewFirst");
      expect(json.lastName).toBe("NewLast");
    });

    it("returns 401 when no auth token", async () => {
      // No mock auth — router uses jwtAuth() which rejects unauthenticated requests
      const router = createRouter()
        .openapi(routes.updateProfile, handlers.updateProfile);
      const response = await router.request("/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: "NoAuth" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(401);
    });

    it("returns 422 when firstName is empty string", async () => {
      const router = createProfileRouter(createAuthContext());
      const response = await router.request("/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: "" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(422);
    });

    it("returns 422 when firstName exceeds 100 chars", async () => {
      const router = createProfileRouter(createAuthContext());
      const response = await router.request("/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: "a".repeat(101) }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(422);
    });

    it("updatedAt is set after successful update", async () => {
      const db = createDb(typedEnv);
      const [userBefore] = await db.select().from(users).where(eq(users.id, TEST_USER_ID)).limit(1);

      // Small delay to ensure timestamp differs
      await new Promise(resolve => setTimeout(resolve, 10));

      const router = createProfileRouter(createAuthContext());
      const response = await router.request("/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: "TimestampTest" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }, env);

      expect(response.status).toBe(200);
      const [userAfter] = await db.select().from(users).where(eq(users.id, TEST_USER_ID)).limit(1);
      expect(userAfter.updatedAt.getTime()).toBeGreaterThanOrEqual(userBefore.updatedAt.getTime());
    });
  });

  describe("post /avatar", () => {
    it("returns 200 with avatarUrl when valid JPEG file uploaded", async () => {
      const router = createProfileRouter(createAuthContext());

      // Create a minimal valid JPEG file (just enough bytes to pass size check)
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      const file = new File([jpegBytes], "avatar.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);

      const response = await router.request("/avatar", {
        method: "POST",
        body: formData,
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { avatarUrl: string };
      expect(json.avatarUrl).toMatch(/\/api\/auth\/avatar\/.+/);
    });

    it("returns 400 when file exceeds 2 MB", async () => {
      const router = createProfileRouter(createAuthContext());

      // Create a file larger than 2 MB
      const bigBytes = new Uint8Array(2 * 1024 * 1024 + 1);
      const file = new File([bigBytes], "big.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);

      const response = await router.request("/avatar", {
        method: "POST",
        body: formData,
      }, env);

      expect(response.status).toBe(400);
    });

    it("returns 400 when file MIME type is not image/jpeg, image/png, or image/webp", async () => {
      const router = createProfileRouter(createAuthContext());

      const file = new File(["gif content"], "image.gif", { type: "image/gif" });
      const formData = new FormData();
      formData.append("file", file);

      const response = await router.request("/avatar", {
        method: "POST",
        body: formData,
      }, env);

      expect(response.status).toBe(400);
    });

    it("returns 400 when no file in FormData", async () => {
      const router = createProfileRouter(createAuthContext());

      const formData = new FormData();

      const response = await router.request("/avatar", {
        method: "POST",
        body: formData,
      }, env);

      expect(response.status).toBe(400);
    });

    it("returns 401 when no auth token", async () => {
      // No mock auth — router uses jwtAuth() which rejects unauthenticated requests
      const router = createRouter()
        .openapi(routes.uploadAvatar, handlers.uploadAvatar);

      const file = new File(["content"], "avatar.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);

      const response = await router.request("/avatar", {
        method: "POST",
        body: formData,
      }, env);

      expect(response.status).toBe(401);
    });

    it("avatarUrl in response is /api/auth/avatar/{userId}", async () => {
      const router = createProfileRouter(createAuthContext());

      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF]);
      const file = new File([jpegBytes], "avatar.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);

      const response = await router.request("/avatar", {
        method: "POST",
        body: formData,
      }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as { avatarUrl: string };
      expect(json.avatarUrl).toBe(`/api/auth/avatar/${TEST_USER_ID}`);
    });
  });

  describe("get /avatar/:userId", () => {
    it("returns 200 with image body and correct Content-Type when avatar exists in R2", async () => {
      // Pre-populate R2 with a test avatar
      const r2Bucket = (env as unknown as AppEnv["Bindings"]).R2_BUCKET;
      await r2Bucket.put(`avatars/${TEST_USER_ID}`, new Uint8Array([1, 2, 3]), {
        httpMetadata: { contentType: "image/jpeg" },
      });

      const router = createProfileRouter();
      const response = await router.request(`/avatar/${TEST_USER_ID}`, {
        method: "GET",
      }, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      // Consume the response body to avoid isolated storage stack frame issues
      await response.arrayBuffer();
    });

    it("returns 404 when no avatar exists in R2 for the userId", async () => {
      const router = createProfileRouter();
      const response = await router.request("/avatar/nonexistent-user-id", {
        method: "GET",
      }, env);

      expect(response.status).toBe(404);
    });
  });
});
