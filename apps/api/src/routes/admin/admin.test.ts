import { applyD1Migrations, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  auditLogs,
  boardMembers,
  boards,
  columns,
  tasks,
  users,
  workspaces,
} from "@/api/db/schema";
import { getClientInfo, logAdminAction } from "@/api/lib/audit-logger";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./admin.handlers";
import * as routes from "./admin.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Create test router with mock auth
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.listAdminWorkspaces, handlers.listAdminWorkspaces)
    .openapi(routes.getAdminWorkspace, handlers.getAdminWorkspace)
    .openapi(routes.updateAdminWorkspace, handlers.updateAdminWorkspace)
    .openapi(routes.deleteAdminWorkspace, handlers.deleteAdminWorkspace)
    .openapi(routes.listAdminUsers, handlers.listAdminUsers)
    .openapi(routes.listAuditLogs, handlers.listAuditLogs);
}

describe("audit_logs schema", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("audit_logs table has correct structure", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_super_admin",
      })
      .returning();

    const [log] = await db
      .insert(auditLogs)
      .values({
        actorId: "user_super_admin",
        workspaceId: workspace.id,
        action: "workspace_updated",
        resourceType: "workspace",
        resourceId: workspace.id,
        metadata: { previousName: "Old Name", newName: "Test Workspace" },
        ipAddress: "127.0.0.1",
        userAgent: "Test Agent/1.0",
      })
      .returning();

    expect(log.id).toBeDefined();
    expect(log.actorId).toBe("user_super_admin");
    expect(log.workspaceId).toBe(workspace.id);
    expect(log.action).toBe("workspace_updated");
  });

  it("audit_logs allows null optional fields", async () => {
    const db = createDb(typedEnv);

    const [log] = await db
      .insert(auditLogs)
      .values({
        actorId: "user_super_admin",
        action: "workspace_updated",
        resourceType: "workspace",
      })
      .returning();

    expect(log.workspaceId).toBeNull();
    expect(log.resourceId).toBeNull();
    expect(log.metadata).toBeNull();
  });
});

describe("audit logger helper", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("logAdminAction creates audit log record", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_admin",
      })
      .returning();

    await logAdminAction({
      db,
      actorId: "user_super_admin",
      action: "workspace_updated",
      resourceType: "workspace",
      resourceId: workspace.id,
      workspaceId: workspace.id,
      metadata: { previousName: "Old Name", newName: "Test Workspace" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0 Test Browser",
    });

    const logs = await db.select().from(auditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe("user_super_admin");
  });

  it("getClientInfo extracts IP and user agent from request", () => {
    const mockContext = {
      req: {
        header: (name: string) => {
          const headers: Record<string, string> = {
            "cf-connecting-ip": "203.0.113.42",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          };
          return headers[name.toLowerCase()];
        },
      },
    };

    const clientInfo = getClientInfo(mockContext);
    expect(clientInfo.ipAddress).toBe("203.0.113.42");
    expect(clientInfo.userAgent).toBe("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
  });
});

// eslint-disable-next-line test/prefer-lowercase-title
describe("GET /admin/workspaces", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("super admin can list all workspaces", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    await db.insert(workspaces).values([
      { name: "Workspace A", slug: "workspace-a", ownerId: "user_super_admin" },
      { name: "Workspace B", slug: "workspace-b", ownerId: "user_super_admin" },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request("/admin/workspaces", { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workspaces).toHaveLength(2);
    expect(data.totalCount).toBe(2);
  });

  it("includes billingType defaulting to subscription in list response", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    await db.insert(workspaces).values([
      { name: "Workspace A", slug: "workspace-a", ownerId: "user_super_admin" },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request("/admin/workspaces", { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workspaces[0].billingType).toBe("subscription");
  });

  it("returns 403 for non-super admin", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test", slug: "test", ownerId: "user_admin" })
      .returning();

    await db.insert(users).values({
      id: "user_admin",
      email: "admin@example.com",
      role: "workspace_admin",
      workspaceId: workspace.id,
    });

    const router = createTestRouter({
      userId: "user_admin",
      userEmail: "admin@example.com",
      userRole: "workspace_admin",
      workspaceId: workspace.id,
    });

    const response = await router.request("/admin/workspaces", { method: "GET" }, typedEnv);
    expect(response.status).toBe(403);
  });
});

// eslint-disable-next-line test/prefer-lowercase-title
describe("GET /admin/workspaces/:id", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(tasks);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(columns);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boardMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boards);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("super admin can get workspace details", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test Workspace", slug: "test", ownerId: "user_owner" })
      .returning();

    await db.insert(users).values([
      { id: "user_super_admin", email: "superadmin@tracky.app", role: "member", isSuperAdmin: true, workspaceId: null },
      { id: "user_owner", email: "owner@example.com", firstName: "John", lastName: "Doe", role: "workspace_admin", workspaceId: workspace.id },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(`/admin/workspaces/${workspace.id}`, { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe("Test Workspace");
    expect(data.owner.email).toBe("owner@example.com");
  });

  it("includes billingType in detail response", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test Workspace", slug: "test", ownerId: "user_owner" })
      .returning();

    await db.insert(users).values([
      { id: "user_super_admin", email: "superadmin@tracky.app", role: "member", isSuperAdmin: true, workspaceId: null },
      { id: "user_owner", email: "owner@example.com", role: "workspace_admin", workspaceId: workspace.id },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(`/admin/workspaces/${workspace.id}`, { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.billingType).toBe("subscription");
  });

  it("returns 404 for non-existent workspace", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      "/admin/workspaces/00000000-0000-0000-0000-000000000000",
      { method: "GET" },
      typedEnv,
    );
    expect(response.status).toBe(404);
  });
});

// eslint-disable-next-line test/prefer-lowercase-title
describe("PATCH /admin/workspaces/:id", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("super admin can update workspace name", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Old Name", slug: "test", ownerId: "user_super_admin" })
      .returning();

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      `/admin/workspaces/${workspace.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe("New Name");
  });

  it("can update billingType to retainer", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test", slug: "test", ownerId: "user_super_admin" })
      .returning();

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      `/admin/workspaces/${workspace.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingType: "retainer" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.billingType).toBe("retainer");

    // Check audit log includes billing type change metadata
    const logs = await db.select().from(auditLogs);
    const updateLog = logs.find(l => l.action === "workspace_updated");
    expect(updateLog).toBeDefined();
    expect(updateLog!.metadata).toMatchObject({
      previousBillingType: "subscription",
      newBillingType: "retainer",
    });
  });

  it("rejects invalid billingType values", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test", slug: "test", ownerId: "user_super_admin" })
      .returning();

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      `/admin/workspaces/${workspace.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingType: "invalid" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(422);
  });

  it("returns 422 for empty update", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test", slug: "test", ownerId: "user_super_admin" })
      .returning();

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      `/admin/workspaces/${workspace.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      typedEnv,
    );
    expect(response.status).toBe(422);
  });
});

// eslint-disable-next-line test/prefer-lowercase-title
describe("DELETE /admin/workspaces/:id", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("super admin can soft-delete workspace", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test", slug: "test", ownerId: "user_super_admin" })
      .returning();

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      `/admin/workspaces/${workspace.id}`,
      { method: "DELETE" },
      typedEnv,
    );

    expect(response.status).toBe(204);

    const [deleted] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id));
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("returns 409 for already deleted workspace", async () => {
    const db = createDb(typedEnv);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Test", slug: "test", ownerId: "user_super_admin", deletedAt: new Date() })
      .returning();

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      `/admin/workspaces/${workspace.id}`,
      { method: "DELETE" },
      typedEnv,
    );
    expect(response.status).toBe(409);
  });
});

// eslint-disable-next-line test/prefer-lowercase-title
describe("GET /admin/users", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("super admin can list all users", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values([
      { id: "user_super_admin", email: "superadmin@tracky.app", role: "member", isSuperAdmin: true, workspaceId: null },
      { id: "user_member", email: "member@example.com", role: "member", workspaceId: null },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request("/admin/users", { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users).toHaveLength(2);
  });

  it("supports filtering by isSuperAdmin", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values([
      { id: "user_super_admin", email: "superadmin@tracky.app", role: "member", isSuperAdmin: true, workspaceId: null },
      { id: "user_member", email: "member@example.com", role: "member", workspaceId: null },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request("/admin/users?isSuperAdmin=true", { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users).toHaveLength(1);
    expect(data.users[0].isSuperAdmin).toBe(true);
  });
});

// eslint-disable-next-line test/prefer-lowercase-title
describe("GET /admin/audit-logs", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("super admin can view audit logs", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    await db.insert(auditLogs).values([
      { actorId: "user_super_admin", action: "workspace_updated", resourceType: "workspace" },
      { actorId: "user_super_admin", action: "workspace_deleted", resourceType: "workspace" },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request("/admin/audit-logs", { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.auditLogs.length).toBeGreaterThanOrEqual(2);
  });

  it("supports filtering by action", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    await db.insert(auditLogs).values([
      { actorId: "user_super_admin", action: "workspace_updated", resourceType: "workspace" },
      { actorId: "user_super_admin", action: "workspace_deleted", resourceType: "workspace" },
    ]);

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request(
      "/admin/audit-logs?action=workspace_updated",
      { method: "GET" },
      typedEnv,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(
      data.auditLogs.every((log: { action: string }) => log.action === "workspace_updated"),
    ).toBe(true);
  });

  it("includes actor details", async () => {
    const db = createDb(typedEnv);

    await db.insert(users).values({
      id: "user_super_admin",
      email: "superadmin@tracky.app",
      firstName: "Super",
      lastName: "Admin",
      role: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    await db.insert(auditLogs).values({
      actorId: "user_super_admin",
      action: "workspace_updated",
      resourceType: "workspace",
    });

    const router = createTestRouter({
      userId: "user_super_admin",
      userEmail: "superadmin@tracky.app",
      userRole: "member",
      isSuperAdmin: true,
      workspaceId: null,
    });

    const response = await router.request("/admin/audit-logs", { method: "GET" }, typedEnv);

    expect(response.status).toBe(200);
    const data = await response.json();
    const log = data.auditLogs.find((l: { action: string }) => l.action === "workspace_updated");
    expect(log.actor).not.toBeNull();
    expect(log.actor.email).toBe("superadmin@tracky.app");
  });
});
