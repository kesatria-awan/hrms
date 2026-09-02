import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { boardMembers, boards, columns, users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./column.handlers";
import * as routes from "./column.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

// Create test router with mock auth
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.createColumn, handlers.createColumn)
    .openapi(routes.updateColumn, handlers.updateColumn)
    .openapi(routes.deleteColumn, handlers.deleteColumn)
    .openapi(routes.reorderColumns, handlers.reorderColumns);
}

describe("column routes", () => {
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

  describe("post /columns", () => {
    it("creates a new column", async () => {
      const db = createDb(typedEnv);

      // Create workspace, user, and board
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
        visibility: "workspace",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      // Create existing columns
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

      const response = await client.columns.$post({
        json: {
          boardId: board.id,
          name: "In Review",
        },
      });

      expect(response.status).toBe(201);

      if (response.status === 201) {
        const json = await response.json();
        expect(json.name).toBe("In Review");
        expect(json.boardId).toBe(board.id);
        expect(json.position).toBe(2); // After existing columns
        expect(json.isDefault).toBe(false);
        expect(json.isDoneColumn).toBe(false);
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

      const response = await client.columns.$post({
        json: {
          boardId: board.id,
          name: "New Column",
        },
      });

      expect(response.status).toBe(403);
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

      const response = await client.columns.$post({
        json: {
          boardId: "nonexistent-board-id",
          name: "New Column",
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe("patch /columns/:id", () => {
    it("updates column name", async () => {
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
        visibility: "workspace",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const [column] = await db.insert(columns).values({
        boardId: board.id,
        name: "Old Name",
        position: 0,
        isDefault: false,
        isDoneColumn: false,
      }).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.columns[":id"].$patch({
        param: { id: column.id },
        json: {
          name: "New Name",
        },
      });

      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();
        expect(json.name).toBe("New Name");
      }
    });

    it("prevents renaming default columns", async () => {
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
        visibility: "workspace",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const [column] = await db.insert(columns).values({
        boardId: board.id,
        name: "To Do",
        position: 0,
        isDefault: true,
        isDoneColumn: false,
      }).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.columns[":id"].$patch({
        param: { id: column.id },
        json: {
          name: "Custom Name",
        },
      });

      expect(response.status).toBe(403);

      if (response.status === 403) {
        const json = await response.json();
        expect(json.message).toContain("Cannot rename default columns");
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

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "member",
      });

      const [column] = await db.insert(columns).values({
        boardId: board.id,
        name: "Test Column",
        position: 0,
        isDefault: false,
        isDoneColumn: false,
      }).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.columns[":id"].$patch({
        param: { id: column.id },
        json: {
          name: "New Name",
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("delete /columns/:id", () => {
    it("deletes a column", async () => {
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
        visibility: "workspace",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const [column] = await db.insert(columns).values({
        boardId: board.id,
        name: "Custom Column",
        position: 0,
        isDefault: false,
        isDoneColumn: false,
      }).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.columns[":id"].$delete({
        param: { id: column.id },
      });

      expect(response.status).toBe(204);

      // Verify column was deleted
      const [deletedColumn] = await db.select()
        .from(columns)
        .where(eq(columns.id, column.id));

      expect(deletedColumn).toBeUndefined();
    });

    it("prevents deleting default columns", async () => {
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
        visibility: "workspace",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const [column] = await db.insert(columns).values({
        boardId: board.id,
        name: "To Do",
        position: 0,
        isDefault: true,
        isDoneColumn: false,
      }).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.columns[":id"].$delete({
        param: { id: column.id },
      });

      expect(response.status).toBe(403);

      if (response.status === 403) {
        const json = await response.json();
        expect(json.message).toContain("Cannot delete default columns");
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

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "member",
      });

      const [column] = await db.insert(columns).values({
        boardId: board.id,
        name: "Test Column",
        position: 0,
        isDefault: false,
        isDoneColumn: false,
      }).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.columns[":id"].$delete({
        param: { id: column.id },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("patch /columns/reorder", () => {
    it("reorders columns", async () => {
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
        visibility: "workspace",
        createdById: "user_1",
        position: 0,
      }).returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "admin",
      });

      const [col1, col2, col3] = await db.insert(columns).values([
        {
          boardId: board.id,
          name: "Column 1",
          position: 0,
          isDefault: false,
          isDoneColumn: false,
        },
        {
          boardId: board.id,
          name: "Column 2",
          position: 1,
          isDefault: false,
          isDoneColumn: false,
        },
        {
          boardId: board.id,
          name: "Column 3",
          position: 2,
          isDefault: false,
          isDoneColumn: false,
        },
      ]).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      // Reorder: col3, col1, col2
      const response = await client.boards[":boardId"].columns.reorder.$patch({
        param: { boardId: board.id },
        json: {
          columnIds: [col3.id, col1.id, col2.id],
        },
      });

      expect(response.status).toBe(200);

      if (response.status === 200) {
        const json = await response.json();

        // Response is the array of reordered columns
        expect(json).toHaveLength(3);

        // Verify new positions in database
        const updatedColumns = await db.select()
          .from(columns)
          .where(eq(columns.boardId, board.id))
          .orderBy(columns.position);

        expect(updatedColumns[0].id).toBe(col3.id);
        expect(updatedColumns[1].id).toBe(col1.id);
        expect(updatedColumns[2].id).toBe(col2.id);
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

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_1",
        role: "member",
      });

      const [col1, col2] = await db.insert(columns).values([
        {
          boardId: board.id,
          name: "Column 1",
          position: 0,
          isDefault: false,
          isDoneColumn: false,
        },
        {
          boardId: board.id,
          name: "Column 2",
          position: 1,
          isDefault: false,
          isDoneColumn: false,
        },
      ]).returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "test@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const client = testClient(router, env);

      const response = await client.boards[":boardId"].columns.reorder.$patch({
        param: { boardId: board.id },
        json: {
          columnIds: [col2.id, col1.id],
        },
      });

      expect(response.status).toBe(403);
    });
  });
});
