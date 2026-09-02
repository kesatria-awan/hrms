import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { boardMembers, boards, columns, users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./board.handlers";
import * as routes from "./board.routes";

// Mock notification email dispatch to prevent async DB/HTTP operations leaking into test teardown
vi.mock("@/api/lib/notification-email", () => ({
  dispatchNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

// Create test router with mock auth
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.listBoards, handlers.listBoards)
    .openapi(routes.getBoard, handlers.getBoard)
    .openapi(routes.createBoard, handlers.createBoard)
    .openapi(routes.updateBoard, handlers.updateBoard)
    .openapi(routes.deleteBoard, handlers.deleteBoard)
    .openapi(routes.addBoardMember, handlers.addBoardMember)
    .openapi(routes.removeBoardMember, handlers.removeBoardMember);
}

describe("board routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    // Clean up database before each test
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(boardMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(columns);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(boards);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Intentionally clearing all test data
    await db.delete(workspaces);
  });

  describe("post /boards", () => {
    it("creates a new board with default columns", async () => {
      const db = createDb(typedEnv);

      // Create workspace and user
      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards.$post({
        json: {
          name: "Product Roadmap",
          description: "Q1 2024 roadmap",
          color: "#3B82F6",
        },
      });

      expect(response.status).toBe(201);

      if (response.status === 201) {
        const json = await response.json();
        expect(json.name).toBe("Product Roadmap");
        expect(json.description).toBe("Q1 2024 roadmap");
        expect(json.color).toBe("#3B82F6");
        expect(json.visibility).toBe("private");
        expect(json.workspaceId).toBe(workspace.id);
        expect(json.createdById).toBe("user_1");
        expect(json.columns).toHaveLength(3); // Default columns: To Do, In Progress, Done
        expect(json.columns[0].name).toBe("To Do");
        expect(json.columns[1].name).toBe("In Progress");
        expect(json.columns[2].name).toBe("Done");
      }
    });

    it("adds creator as board admin", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards.$post({
        json: {
          name: "Test Board",
        },
      });

      expect(response.status).toBe(201);

      if (response.status === 201) {
        const json = await response.json();

        // Check board member was created
        const [member] = await db.select()
          .from(boardMembers)
          .where(eq(boardMembers.boardId, json.id));

        expect(member).toBeDefined();
        expect(member.userId).toBe("user_1");
        expect(member.role).toBe("admin");
      }
    });

    it("enforces board limit for free plan workspace", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
        plan: "free",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      // Create 5 boards (free plan max)
      for (let i = 0; i < 5; i++) {
        await db.insert(boards).values({
          workspaceId: workspace.id,
          name: `Board ${i}`,
          color: "#3B82F6",
          visibility: "private",
          createdById: "user_1",
          position: i,
        });
      }

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards.$post({
        json: {
          name: "Sixth Board",
        },
      });

      expect(response.status).toBe(422);

      if (response.status === 422) {
        const json = await response.json();
        expect(json.message).toContain("Board limit reached");
      }
    });

    it("allows more than 5 boards for pro plan workspace", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Pro Workspace",
        slug: "pro-workspace",
        ownerId: "user_1",
        plan: "pro",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      // Create 5 boards
      for (let i = 0; i < 5; i++) {
        await db.insert(boards).values({
          workspaceId: workspace.id,
          name: `Board ${i}`,
          color: "#3B82F6",
          visibility: "private",
          createdById: "user_1",
          position: i,
        });
      }

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards.$post({
        json: {
          name: "Sixth Board",
        },
      });

      expect(response.status).toBe(201);
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

      const response = await client.boards.$post({
        json: {
          name: "Test Board",
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("get /boards", () => {
    it("returns only boards in user's workspace", async () => {
      const db = createDb(typedEnv);

      // Create two workspaces
      const [workspace1] = await db.insert(workspaces).values({
        name: "Workspace 1",
        slug: "workspace-1",
        ownerId: "user_1",
      }).returning();

      const [workspace2] = await db.insert(workspaces).values({
        name: "Workspace 2",
        slug: "workspace-2",
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

      // Create boards in both workspaces
      const [board1] = await db.insert(boards).values({
        workspaceId: workspace1.id,
        name: "Board 1",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boards).values({
        workspaceId: workspace2.id,
        name: "Board 2",
        color: "#10B981",
        visibility: "private",
        createdById: "user_2",
        position: 0,
      });

      // Add user_1 as member of board1
      await db.insert(boardMembers).values({
        boardId: board1.id,
        userId: "user_1",
        role: "admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace1.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards.$get();

      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json).toHaveLength(1);
        expect(json[0].name).toBe("Board 1");
        expect(json[0].workspaceId).toBe(workspace1.id);
      }
    });

    it("returns only boards user is a member of", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "user1@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      // Create two boards
      const [board1] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Board A",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_2",
        position: 0,
      }).returning();

      await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Board B",
        color: "#EC4899",
        visibility: "private",
        createdById: "user_2",
        position: 1,
      });

      // Add user_1 as member of board1 only
      await db.insert(boardMembers).values({
        boardId: board1.id,
        userId: "user_1",
        role: "member",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards.$get();

      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json).toHaveLength(1);
        expect(json[0].name).toBe("Board A");
      }
    });

    it("does not return boards user is not a member of", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "user1@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      // Create private board without adding user as member
      await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Secret Board",
        color: "#EC4899",
        visibility: "private",
        createdById: "user_2",
        position: 0,
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards.$get();

      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json).toHaveLength(0);
      }
    });
  });

  describe("get /boards/:id", () => {
    it("returns board with columns if user has access", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(columns).values([
        {
          boardId: board.id,
          name: "To Do",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        },
        {
          boardId: board.id,
          name: "Done",
          position: 1,
          isDefault: true,
          isDoneColumn: true,
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].$get({
        param: { id: board.id },
      });

      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json.name).toBe("Test Board");
        expect(json.columns).toHaveLength(2);
        expect(json.columns[0].name).toBe("To Do");
        expect(json.columns[1].name).toBe("Done");
      }
    });

    it("returns 404 if board does not exist", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].$get({
        param: { id: "00000000-0000-0000-0000-000000000000" },
      });

      expect(response.status).toBe(404);
    });

    it("returns 404 if user is not a board member", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "test@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Private Board",
        color: "#EC4899",
        visibility: "private",
        createdById: "user_2",
        position: 0,
      }).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].$get({
        param: { id: board.id },
      });

      expect(response.status).toBe(404);
    });
  });

  describe("patch /boards/:id", () => {
    it("updates board if user has edit permission", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Old Name",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].$patch({
        param: { id: board.id },
        json: {
          name: "New Name",
          description: "Updated description",
        },
      });

      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json.name).toBe("New Name");
        expect(json.description).toBe("Updated description");
      }
    });

    it("returns 403 if user does not have edit permission", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "test@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_2",
        position: 0,
      }).returning();

      // Add user as member (not owner)
      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "member",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].$patch({
        param: { id: board.id },
        json: {
          name: "New Name",
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("delete /boards/:id", () => {
    it("soft deletes board if user has delete permission", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "test@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].$delete({
        param: { id: board.id },
      });

      expect(response.status).toBe(204);

      // Verify board is soft deleted
      const [deletedBoard] = await db.select()
        .from(boards)
        .where(eq(boards.id, board.id));

      expect(deletedBoard.deletedAt).not.toBeNull();
    });

    it("returns 403 if user does not have delete permission", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "test@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_2",
        position: 0,
      }).returning();

      // Add user as member (not owner)
      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "member",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].$delete({
        param: { id: board.id },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("post /boards/:id/members", () => {
    it("adds member to board", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "user1@example.com",
          workspaceId: workspace.id,
          role: "workspace_admin",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      // Use app.request() with env as third parameter (Hono testing docs pattern)
      const response = await router.request(
        `/boards/${board.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: "user_2",
            role: "member",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);

      if (response.status === 201) {
        const json = await response.json();
        expect(json.userId).toBe("user_2");
        expect(json.role).toBe("member");
      }
    });

    it("returns 409 if member already exists", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "user1@example.com",
          workspaceId: workspace.id,
          role: "workspace_admin",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      // Add both users as members
      await db.insert(boardMembers).values([
        {
          boardId: board.id,
          userId: "user_1",
          role: "admin",
        },
        {
          boardId: board.id,
          userId: "user_2",
          role: "member",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      // Use app.request() with env as third parameter (Hono testing docs pattern)
      const response = await router.request(
        `/boards/${board.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: "user_2",
            role: "member",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(409);
    });

    it("returns 403 if user does not have manage members permission", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "user1@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
        {
          id: "user_3",
          email: "user3@example.com",
          workspaceId: workspace.id,
          role: "workspace_admin",
        },
      ]);

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_3",
        position: 0,
      }).returning();

      // Add user_1 as member (cannot manage members)
      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "member",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      // Use app.request() with env as third parameter (Hono testing docs pattern)
      const response = await router.request(
        `/boards/${board.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: "user_2",
            role: "member",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(403);
    });
  });

  describe("delete /boards/:id/members/:userId", () => {
    it("removes member from board", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values([
        {
          id: "user_1",
          email: "user1@example.com",
          workspaceId: workspace.id,
          role: "workspace_admin",
        },
        {
          id: "user_2",
          email: "user2@example.com",
          workspaceId: workspace.id,
          role: "member",
        },
      ]);

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values([
        {
          boardId: board.id,
          userId: "user_1",
          role: "admin",
        },
        {
          boardId: board.id,
          userId: "user_2",
          role: "member",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].members[":userId"].$delete({
        param: { id: board.id, userId: "user_2" },
      });

      expect(response.status).toBe(204);

      // Verify member was removed
      const [member] = await db.select()
        .from(boardMembers)
        .where(and(
          eq(boardMembers.boardId, board.id),
          eq(boardMembers.userId, "user_2"),
        ));

      expect(member).toBeUndefined();
    });

    it("prevents removing the last admin", async () => {
      const db = createDb(typedEnv);

      const [workspace] = await db.insert(workspaces).values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_1",
      }).returning();

      await db.insert(users).values({
        id: "user_1",
        email: "user1@example.com",
        workspaceId: workspace.id,
        role: "workspace_admin",
      });

      const [board] = await db.insert(boards).values({
        workspaceId: workspace.id,
        name: "Test Board",
        color: "#3B82F6",
        visibility: "private",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":id"].members[":userId"].$delete({
        param: { id: board.id, userId: "user_1" },
      });

      expect(response.status).toBe(403);

      if (response.status === 403) {
        const json = await response.json();
        expect(json.message).toContain("Cannot remove the last admin");
      }
    });
  });
});
