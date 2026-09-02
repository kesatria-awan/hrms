import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { testClient } from "hono/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { announcements, users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./announcement.handlers";
import * as routes from "./announcement.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.listAnnouncements, handlers.listAnnouncements)
    .openapi(routes.createAnnouncement, handlers.createAnnouncement);
}

describe("announcement routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(announcements);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaces);
  });

  describe("schema", () => {
    it("announcement table has correct structure", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-ws",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const [announcement] = await db.insert(announcements).values({
        workspaceId: workspace.id,
        authorId: "user_1",
        title: "Test Announcement",
        body: "Test body",
      }).returning();

      expect(announcement.id).toBeDefined();
      expect(announcement.workspaceId).toBe(workspace.id);
      expect(announcement.authorId).toBe("user_1");
      expect(announcement.title).toBe("Test Announcement");
      expect(announcement.body).toBe("Test body");
      expect(announcement.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("get /announcements", () => {
    it("returns announcements with author info", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-ws",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        imageUrl: "https://example.com/avatar.png",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      await db.insert(announcements).values({
        workspaceId: workspace.id,
        authorId: "user_1",
        title: "Hello Team",
        body: "Welcome aboard!",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "admin@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.announcements.$get();
      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json).toHaveLength(1);
        expect(json[0].title).toBe("Hello Team");
        expect(json[0].body).toBe("Welcome aboard!");
        expect(json[0].author.firstName).toBe("Admin");
        expect(json[0].author.lastName).toBe("User");
        expect(json[0].author.email).toBe("admin@example.com");
        expect(json[0].author.imageUrl).toBe("https://example.com/avatar.png");
      }
    });

    it("orders by createdAt DESC", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-ws",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "admin@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      // Insert with different timestamps
      await db.insert(announcements).values({
        workspaceId: workspace.id,
        authorId: "user_1",
        title: "First",
        createdAt: new Date("2024-01-01"),
      });

      await db.insert(announcements).values({
        workspaceId: workspace.id,
        authorId: "user_1",
        title: "Second",
        createdAt: new Date("2024-06-01"),
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "admin@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.announcements.$get();
      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json).toHaveLength(2);
        expect(json[0].title).toBe("Second");
        expect(json[1].title).toBe("First");
      }
    });

    it("does not return announcements from other workspaces", async () => {
      const db = createDb(typedEnv);

      const [workspace1] = await db.insert(workspaces).values({
        name: "Workspace 1",
        slug: "ws-1",
        ownerId: "user_1",
      }).returning();

      const [workspace2] = await db.insert(workspaces).values({
        name: "Workspace 2",
        slug: "ws-2",
        ownerId: "user_2",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "user1@example.com",
          workspaceId: workspace1.id,
          role: "workspace_admin",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace2.id,
          role: "workspace_admin",
        },
      ]);

      await db.insert(announcements).values([
        {
          workspaceId: workspace1.id,
          authorId: "user_1",
          title: "WS1 Announcement",
        },
        {
          workspaceId: workspace2.id,
          authorId: "user_2",
          title: "WS2 Announcement",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace1.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.announcements.$get();
      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json).toHaveLength(1);
        expect(json[0].title).toBe("WS1 Announcement");
      }
    });

    it("requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.announcements.$get();
      expect(response.status).toBe(401);
    });
  });

  describe("post /announcements", () => {
    it("admin can create announcement", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-ws",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "admin@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/announcements",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Important Update",
            body: "Please read carefully.",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);

      if (response.status === 201) {
        const json = await response.json() as Record<string, unknown>;
        expect(json.title).toBe("Important Update");
        expect(json.body).toBe("Please read carefully.");
        expect(json.authorId).toBe("user_1");
        expect(json.workspaceId).toBe(workspace.id);
        expect((json.author as Record<string, unknown>).firstName).toBe("Admin");
      }
    });

    it("member cannot create announcement", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-ws",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_2",
        email: "member@example.com",
        workspaceId: workspace.id,
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "member@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
        workspaceRole: "member" as const,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/announcements",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Should Fail",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("requires title field", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-ws",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "admin@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "admin@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/announcements",
        {
          method: "POST",
          body: JSON.stringify({}),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(422);
    });

    it("requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/announcements",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Should Fail",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(401);
    });
  });
});
