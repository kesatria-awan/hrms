import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { users, workspaceInvitations, workspaceMembers, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { hashToken } from "@/api/lib/token";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./workspace.handlers";
import * as routes from "./workspace.routes";

vi.mock("@/api/lib/notification-email", () => ({
  dispatchNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock email provider sendEmail
vi.mock("@/api/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "test-invitation" }),
}));

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

// Create test router with mock auth
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.listWorkspaceMembers, handlers.listWorkspaceMembers)
    .openapi(routes.listWorkspaceInvitations, handlers.listWorkspaceInvitations)
    .openapi(routes.createWorkspaceInvitation, handlers.createWorkspaceInvitation)
    .openapi(routes.revokeWorkspaceInvitation, handlers.revokeWorkspaceInvitation)
    .openapi(routes.resendWorkspaceInvitation, handlers.resendWorkspaceInvitation)
    .openapi(routes.updateWorkspaceMemberRole, handlers.updateWorkspaceMemberRole)
    .openapi(routes.removeWorkspaceMember, handlers.removeWorkspaceMember)
    .openapi(routes.updateWorkspaceSettings, handlers.updateWorkspaceSettings)
    .openapi(routes.listWorkspaceAuditLogs, handlers.listWorkspaceAuditLogs);
}

describe("workspace member routes", () => {
  let workspace: { id: string; name: string; slug: string };
  let adminUser: { id: string; email: string };
  let memberUser: { id: string; email: string };

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Clean up database
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaceInvitations);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaceMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaces);

    // Create test workspace
    const [ws] = await db.insert(workspaces).values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_admin",
    }).returning();
    workspace = ws;

    // Create admin user
    await db.insert(users).values({
      id: "user_admin",
      email: "admin@example.com",
      workspaceId: workspace.id,
      role: "workspace_admin",
    });
    adminUser = { id: "user_admin", email: "admin@example.com" };

    // Create workspace member for admin
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: "user_admin",
      role: "owner",
    });

    // Create regular member
    await db.insert(users).values({
      id: "user_member",
      email: "member@example.com",
      workspaceId: workspace.id,
      role: "member",
    });
    memberUser = { id: "user_member", email: "member@example.com" };

    // Create workspace member for regular member
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: "user_member",
      role: "user",
    });
  });

  describe("get /workspaces/:slug/members", () => {
    it("lists workspace members from D1", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const json = await response.json() as { members: unknown[]; totalCount: number };
      expect(json).toHaveProperty("members");
      expect(json.members).toHaveLength(2);
      expect(json.totalCount).toBe(2);
    });

    it("allows regular members to view member list", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(200);
    });

    it("returns 404 for non-existent workspace", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/non-existent-slug/members`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(404);
    });

    it("returns 403 if user is not in this workspace", async () => {
      const mockAuth = {
        userId: "user_outsider",
        userEmail: "outsider@example.com",
        userRole: "member" as const,
        workspaceId: "other-workspace-id",
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });
  });

  describe("get /workspaces/:slug/invitations", () => {
    it("lists pending invitations for workspace admin", async () => {
      const db = createDb(typedEnv);
      // Insert a pending invitation
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(workspaceInvitations).values({
        workspaceId: workspace.id,
        inviterUserId: adminUser.id,
        email: "newuser@example.com",
        role: "user",
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const json = await response.json() as { invitations: Array<{ email: string; role: string }>; totalCount: number };
      expect(json).toHaveProperty("invitations");
      expect(json.invitations).toHaveLength(1);
      expect(json.invitations[0]).toHaveProperty("email", "newuser@example.com");
      expect(json.invitations[0]).toHaveProperty("role", "user");
    });

    it("returns 403 for non-admin members", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "user" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });

    it("does not list used or revoked invitations", async () => {
      const db = createDb(typedEnv);
      const rawToken1 = crypto.randomUUID();
      const rawToken2 = crypto.randomUUID();
      const rawToken3 = crypto.randomUUID();

      await db.insert(workspaceInvitations).values([
        {
          workspaceId: workspace.id,
          inviterUserId: adminUser.id,
          email: "pending@example.com",
          role: "user",
          tokenHash: await hashToken(rawToken1),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        {
          workspaceId: workspace.id,
          inviterUserId: adminUser.id,
          email: "used@example.com",
          role: "user",
          tokenHash: await hashToken(rawToken2),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          usedAt: new Date(),
        },
        {
          workspaceId: workspace.id,
          inviterUserId: adminUser.id,
          email: "revoked@example.com",
          role: "user",
          tokenHash: await hashToken(rawToken3),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revokedAt: new Date(),
        },
      ]);

      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const json = await response.json() as { invitations: Array<{ email: string }> };
      expect(json.invitations).toHaveLength(1);
      expect(json.invitations[0].email).toBe("pending@example.com");
    });
  });

  describe("post /workspaces/:slug/invitations", () => {
    it("creates invitation for workspace admin", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({
            email: "invited@example.com",
            role: "user",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(201);
      const json = await response.json() as { id: string; email: string; role: string };
      expect(json).toHaveProperty("email", "invited@example.com");
      expect(json).toHaveProperty("role", "user");
      expect(json).toHaveProperty("id");
    });

    it("returns 409 for duplicate pending invitation (D-10)", async () => {
      const db = createDb(typedEnv);
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      await db.insert(workspaceInvitations).values({
        workspaceId: workspace.id,
        inviterUserId: adminUser.id,
        email: "invited@example.com",
        role: "user",
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email: "invited@example.com", role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(409);
      const json = await response.json() as { message: string };
      expect(json.message).toContain("pending invitation");
    });

    it("returns 409 when email is already a member", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email: memberUser.email, role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(409);
      const json = await response.json() as { message: string };
      expect(json.message).toContain("already a member");
    });

    it("returns 403 for non-admin members", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "user" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email: "invited@example.com", role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });

    it("validates email format", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email: "not-an-email", role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(422);
    });

    it("validates role is valid", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email: "invited@example.com", role: "invalid_role" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(422);
    });

    it("includes rawToken in invitation response when E2E_MODE=true", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email: "invite-e2e@test.com", role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        { ...typedEnv, E2E_MODE: "true" },
      );
      expect(response.status).toBe(201);
      const body = await response.json() as { rawToken?: string };
      expect(body.rawToken).toBeDefined();
      expect(typeof body.rawToken).toBe("string");
      expect((body.rawToken as string).length).toBeGreaterThan(0);
    });

    it("does NOT include rawToken in invitation response when E2E_MODE is not set", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email: "invite-normal@test.com", role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv, // no E2E_MODE
      );
      expect(response.status).toBe(201);
      const body = await response.json() as { rawToken?: string };
      expect(body.rawToken).toBeUndefined();
    });
  });

  describe("delete /workspaces/:slug/invitations/:invitationId", () => {
    it("revokes (hard-deletes) invitation for workspace admin", async () => {
      const db = createDb(typedEnv);
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      const [inv] = await db.insert(workspaceInvitations).values({
        workspaceId: workspace.id,
        inviterUserId: adminUser.id,
        email: "todelete@example.com",
        role: "user",
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();

      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations/${inv.id}`,
        { method: "DELETE" },
        typedEnv,
      );

      expect(response.status).toBe(204);

      // Verify hard deletion
      const [remaining] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, inv.id));
      expect(remaining).toBeUndefined();
    });

    it("returns 404 for non-existent invitation", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations/non-existent-id`,
        { method: "DELETE" },
        typedEnv,
      );

      expect(response.status).toBe(404);
    });

    it("returns 403 for non-admin members", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "user" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations/inv_1`,
        { method: "DELETE" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });
  });

  describe("post /workspaces/:slug/invitations/:invitationId/resend", () => {
    it("resends invitation with new token (D-09)", async () => {
      const db = createDb(typedEnv);
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      const [inv] = await db.insert(workspaceInvitations).values({
        workspaceId: workspace.id,
        inviterUserId: adminUser.id,
        email: "resend@example.com",
        role: "user",
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();

      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations/${inv.id}/resend`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(201);
      const json = await response.json() as { id: string; email: string };
      expect(json).toHaveProperty("email", "resend@example.com");
      // New invitation has a different id
      expect(json.id).not.toBe(inv.id);

      // Old invitation should be deleted
      const [old] = await db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, inv.id));
      expect(old).toBeUndefined();
    });

    it("resends expired invitation (D-09 works for expired)", async () => {
      const db = createDb(typedEnv);
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      const [inv] = await db.insert(workspaceInvitations).values({
        workspaceId: workspace.id,
        inviterUserId: adminUser.id,
        email: "expired@example.com",
        role: "user",
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      }).returning();

      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations/${inv.id}/resend`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(201);
    });

    it("returns 404 for non-existent invitation", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations/non-existent-id/resend`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(404);
    });

    it("returns 403 for non-admin members", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "user" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/invitations/inv_1/resend`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });
  });

  describe("patch /workspaces/:slug/members/:userId/role", () => {
    it("updates member role for workspace admin", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/user_member/role`,
        {
          method: "PATCH",
          body: JSON.stringify({ role: "admin" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const json = await response.json() as { role: string };
      expect(json).toHaveProperty("role", "admin");
    });

    it("returns 403 for non-admin members", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "user" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/user_admin/role`,
        {
          method: "PATCH",
          body: JSON.stringify({ role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });

    it("prevents changing role of owner", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/user_admin/role`,
        {
          method: "PATCH",
          body: JSON.stringify({ role: "user" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(422);
      const json = await response.json() as { message: string };
      expect(json.message).toContain("owner");
    });

    it("returns 404 for non-existent member", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/non_existent/role`,
        {
          method: "PATCH",
          body: JSON.stringify({ role: "admin" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("delete /workspaces/:slug/members/:userId", () => {
    it("removes member for workspace admin", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/user_member`,
        { method: "DELETE" },
        typedEnv,
      );

      expect(response.status).toBe(204);

      // Verify the member was removed from DB
      const db = createDb(typedEnv);
      const [membership] = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, "user_member"));
      expect(membership).toBeUndefined();
    });

    it("returns 403 for non-admin members trying to remove others", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "user" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/user_admin`,
        { method: "DELETE" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });

    it("allows member to remove themselves (self-removal)", async () => {
      const mockAuth = {
        userId: memberUser.id,
        userEmail: memberUser.email,
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "user" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/user_member`,
        { method: "DELETE" },
        typedEnv,
      );

      expect(response.status).toBe(204);
    });

    it("returns 404 for non-existent member", async () => {
      const mockAuth = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/workspaces/${workspace.slug}/members/non_existent`,
        { method: "DELETE" },
        typedEnv,
      );

      expect(response.status).toBe(404);
    });
  });
});
