import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { auditLogs, users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./workspace.handlers";
import * as routes from "./workspace.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.updateWorkspaceSettings, handlers.updateWorkspaceSettings)
    .openapi(routes.listWorkspaceAuditLogs, handlers.listWorkspaceAuditLogs);
}

describe("workspace settings routes", () => {
  let workspace: { id: string; slug: string };

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaces);

    const [ws] = await db.insert(workspaces).values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_admin",
      clerkOrgId: "org_test123",
    }).returning();
    workspace = ws;

    await db.insert(users).values({
      id: "user_admin",
      email: "admin@example.com",
      workspaceId: workspace.id,
      role: "workspace_admin",
    });

    await db.insert(users).values({
      id: "user_member",
      email: "member@example.com",
      workspaceId: workspace.id,
      role: "member",
    });
  });

  describe("patch /workspaces/:slug/settings", () => {
    it("updates workspace name", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: "New Name" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe("New Name");
      expect(data.slug).toBe("test-workspace");
    });

    it("updates workspace slug", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ slug: "new-slug" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.slug).toBe("new-slug");
    });

    it("rejects duplicate slug", async () => {
      const db = createDb(typedEnv);
      await db.insert(workspaces).values({
        name: "Other",
        slug: "taken-slug",
        ownerId: "user_admin",
        clerkOrgId: "org_other",
      });

      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ slug: "taken-slug" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(409);
    });

    it("rejects non-admin users", async () => {
      const router = createTestRouter({
        userId: "user_member",
        userEmail: "member@example.com",
        userRole: "member",
        workspaceId: workspace.id,
        workspaceRole: "user",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: "Hacked" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });

    it("creates audit log entry on update", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      await router.request(
        `/workspaces/${workspace.slug}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: "Audited Name" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        typedEnv,
      );

      const db = createDb(typedEnv);
      const logs = await db.select().from(auditLogs);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe("workspace_settings_updated");
      expect(logs[0].actorId).toBe("user_admin");
      expect(logs[0].workspaceId).toBe(workspace.id);
    });
  });

  describe("get /workspaces/:slug/audit-logs", () => {
    it("returns audit logs for the workspace", async () => {
      const db = createDb(typedEnv);
      await db.insert(auditLogs).values({
        actorId: "user_admin",
        action: "workspace_settings_updated",
        resourceType: "workspace",
        workspaceId: workspace.id,
        resourceId: workspace.id,
        metadata: { changes: { name: "New" } },
      });

      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/audit-logs`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.logs).toHaveLength(1);
      expect(data.logs[0].action).toBe("workspace_settings_updated");
      expect(data.logs[0].actorEmail).toBe("admin@example.com");
      expect(data.totalCount).toBe(1);
      expect(data.page).toBe(1);
    });

    it("paginates results", async () => {
      const db = createDb(typedEnv);
      // Insert 3 logs
      for (let i = 0; i < 3; i++) {
        await db.insert(auditLogs).values({
          actorId: "user_admin",
          action: "workspace_settings_updated",
          resourceType: "workspace",
          workspaceId: workspace.id,
        });
      }

      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/audit-logs?page=1&limit=2`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.logs).toHaveLength(2);
      expect(data.totalCount).toBe(3);
    });

    it("rejects non-admin users", async () => {
      const router = createTestRouter({
        userId: "user_member",
        userEmail: "member@example.com",
        userRole: "member",
        workspaceId: workspace.id,
        workspaceRole: "user",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/audit-logs`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });
  });
});
