import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  activities,
  boardMembers,
  boards,
  columns,
  comments,
  mentions,
  tasks,
  users,
  workspaces,
} from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./activity.handlers";
import * as routes from "./activity.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Create test router with mock auth
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.listActivities, handlers.listActivities)
    .openapi(routes.listTaskActivities, handlers.listTaskActivities);
}

// Helper to create test data
async function setupTestData(db: ReturnType<typeof createDb>) {
  // Create workspace
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_1",
    })
    .returning();

  // Create users
  await db.insert(users).values([
    {
      id: "user_1",
      email: "user1@example.com",
      firstName: "John",
      lastName: "Doe",
      imageUrl: "https://example.com/user1.jpg",
      workspaceId: workspace.id,
      role: "workspace_admin",
    },
    {
      id: "user_2",
      email: "user2@example.com",
      firstName: "Jane",
      lastName: "Smith",
      imageUrl: "https://example.com/user2.jpg",
      workspaceId: workspace.id,
      role: "member",
    },
  ]);

  // Create board
  const [board] = await db
    .insert(boards)
    .values({
      workspaceId: workspace.id,
      name: "Test Board",
      color: "#3B82F6",
      visibility: "workspace",
      createdById: "user_1",
      position: 0,
    })
    .returning();

  // Add user_1 as board owner
  await db.insert(boardMembers).values({
    boardId: board.id,
    userId: "user_1",
    role: "admin",
  });

  // Create column
  const [todoColumn] = await db
    .insert(columns)
    .values({
      boardId: board.id,
      name: "To Do",
      position: 0,
      isDefault: true,
      isDoneColumn: false,
    })
    .returning();

  // Create a task
  const [task] = await db
    .insert(tasks)
    .values({
      workspaceId: workspace.id,
      boardId: board.id,
      columnId: todoColumn.id,
      title: "Test Task",
      position: 0,
      createdById: "user_1",
    })
    .returning();

  return { workspace, board, todoColumn, task };
}

// Helper to create a second workspace for multi-tenant tests
async function setupSecondWorkspace(db: ReturnType<typeof createDb>) {
  const [workspace2] = await db
    .insert(workspaces)
    .values({
      name: "Other Workspace",
      slug: "other-workspace",
      ownerId: "user_other",
    })
    .returning();

  await db.insert(users).values({
    id: "user_other",
    email: "other@example.com",
    workspaceId: workspace2.id,
    role: "workspace_admin",
  });

  const [board2] = await db
    .insert(boards)
    .values({
      workspaceId: workspace2.id,
      name: "Other Board",
      color: "#10B981",
      visibility: "workspace",
      createdById: "user_other",
      position: 0,
    })
    .returning();

  await db.insert(boardMembers).values({
    boardId: board2.id,
    userId: "user_other",
    role: "admin",
  });

  const [otherColumn] = await db
    .insert(columns)
    .values({
      boardId: board2.id,
      name: "To Do",
      position: 0,
      isDefault: true,
      isDoneColumn: false,
    })
    .returning();

  const [otherTask] = await db
    .insert(tasks)
    .values({
      workspaceId: workspace2.id,
      boardId: board2.id,
      columnId: otherColumn.id,
      title: "Other Task",
      position: 0,
      createdById: "user_other",
    })
    .returning();

  return { workspace2, board2, otherColumn, otherTask };
}

// Helper to create a private board
async function setupPrivateBoard(
  db: ReturnType<typeof createDb>,
  workspaceId: string,
) {
  const [privateBoard] = await db
    .insert(boards)
    .values({
      workspaceId,
      name: "Private Board",
      color: "#EF4444",
      visibility: "private",
      createdById: "user_1",
      position: 1,
    })
    .returning();

  await db.insert(boardMembers).values({
    boardId: privateBoard.id,
    userId: "user_1",
    role: "admin",
  });

  const [privateColumn] = await db
    .insert(columns)
    .values({
      boardId: privateBoard.id,
      name: "To Do",
      position: 0,
      isDefault: true,
      isDoneColumn: false,
    })
    .returning();

  const [privateTask] = await db
    .insert(tasks)
    .values({
      workspaceId,
      boardId: privateBoard.id,
      columnId: privateColumn.id,
      title: "Private Task",
      position: 0,
      createdById: "user_1",
    })
    .returning();

  return { privateBoard, privateColumn, privateTask };
}

describe("activity routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // Clean up in correct order (respecting foreign keys)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(activities);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(mentions);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(comments);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(tasks);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boardMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(columns);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boards);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  // ==================== GET /activities (A01-A10) ====================
  describe("get /activities", () => {
    // A01: Returns activities for workspace
    it("a01: returns activities for workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      // Create some activities
      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_updated",
          metadata: { field: "title", oldValue: "Old", newValue: "New" },
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(2);
    });

    // A02: Orders by createdAt DESC
    it("a02: orders by createdAt DESC", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      // Create activities with different timestamps
      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
          createdAt: new Date("2024-01-01"),
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_updated",
          createdAt: new Date("2024-01-03"),
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_archived",
          createdAt: new Date("2024-01-02"),
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].action).toBe("task_updated");
      expect(json[1].action).toBe("task_archived");
      expect(json[2].action).toBe("task_created");
    });

    // A03: Includes user info for actor
    it("a03: includes user info for actor", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(activities).values({
        workspaceId: workspace.id,
        boardId: board.id,
        taskId: task.id,
        userId: "user_1",
        action: "task_created",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].user).toBeDefined();
      expect(json[0].user.firstName).toBe("John");
      expect(json[0].user.lastName).toBe("Doe");
      expect(json[0].user.imageUrl).toBe("https://example.com/user1.jpg");
    });

    // A04: Includes task/board names
    it("a04: includes task/board names", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(activities).values({
        workspaceId: workspace.id,
        boardId: board.id,
        taskId: task.id,
        userId: "user_1",
        action: "task_created",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].boardName).toBe("Test Board");
      expect(json[0].taskTitle).toBe("Test Task");
    });

    // A05: Supports pagination (limit, offset)
    it("a05: supports pagination (limit, offset)", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      // Create 5 activities
      for (let i = 0; i < 5; i++) {
        await db.insert(activities).values({
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_updated",
          metadata: { index: i },
          createdAt: new Date(2024, 0, i + 1),
        });
      }

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      // Get page 2 with limit 2
      const response = await router.request(
        "/activities?limit=2&offset=2",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(2);
      // Should be index 2 and 1 (since ordered by createdAt DESC)
      expect((json[0].metadata as { index: number }).index).toBe(2);
      expect((json[1].metadata as { index: number }).index).toBe(1);
    });

    // A06: Filters by action type
    it("a06: filters by action type", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_updated",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities?action=task_created",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(2);
      expect(json.every((a: { action: string }) => a.action === "task_created")).toBe(true);
    });

    // A07: Filters by boardId
    it("a07: filters by boardId", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);
      const { privateBoard, privateTask } = await setupPrivateBoard(db, workspace.id);

      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
        },
        {
          workspaceId: workspace.id,
          boardId: privateBoard.id,
          taskId: privateTask.id,
          userId: "user_1",
          action: "task_created",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/activities?boardId=${board.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
      expect(json[0].boardId).toBe(board.id);
    });

    // A08: SECURITY - Only returns user's workspace activities
    it("a08: only returns user's workspace activities", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);
      const { workspace2, board2, otherTask } = await setupSecondWorkspace(db);

      // Create activities in both workspaces
      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
        },
        {
          workspaceId: workspace2.id,
          boardId: board2.id,
          taskId: otherTask.id,
          userId: "user_other",
          action: "task_created",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
      expect(json[0].workspaceId).toBe(workspace.id);
    });

    // A09: Member can view workspace activities
    it("a09: member can view workspace activities", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(activities).values({
        workspaceId: workspace.id,
        boardId: board.id,
        taskId: task.id,
        userId: "user_1",
        action: "task_created",
      });

      // user_2 is a member (not admin)
      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
    });

    // A10: Requires authentication
    it("a10: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== GET /tasks/:taskId/activities (A11-A18) ====================
  describe("get /tasks/:taskId/activities", () => {
    // A11: Returns activities for specific task
    it("a11: returns activities for specific task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task, todoColumn } = await setupTestData(db);

      // Create another task
      const [otherTask] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Other Task",
          position: 1,
          createdById: "user_1",
        })
        .returning();

      // Create activities for both tasks
      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: otherTask.id,
          userId: "user_1",
          action: "task_created",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/activities`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
      expect(json[0].taskId).toBe(task.id);
    });

    // A12: Orders by createdAt DESC
    it("a12: orders by createdAt DESC", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
          createdAt: new Date("2024-01-01"),
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_updated",
          createdAt: new Date("2024-01-03"),
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/activities`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].action).toBe("task_updated");
      expect(json[1].action).toBe("task_created");
    });

    // A13: Includes metadata (old/new values)
    it("a13: includes metadata (old/new values)", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(activities).values({
        workspaceId: workspace.id,
        boardId: board.id,
        taskId: task.id,
        userId: "user_1",
        action: "task_updated",
        metadata: {
          field: "title",
          oldValue: "Old Title",
          newValue: "New Title",
        },
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/activities`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].metadata).toBeDefined();
      const metadata = json[0].metadata as { field: string; oldValue: string; newValue: string };
      expect(metadata.field).toBe("title");
      expect(metadata.oldValue).toBe("Old Title");
      expect(metadata.newValue).toBe("New Title");
    });

    // A14: Board viewer can view task activities
    it("a14: board viewer can view task activities", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      await db.insert(activities).values({
        workspaceId: workspace.id,
        boardId: board.id,
        taskId: task.id,
        userId: "user_1",
        action: "task_created",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/activities`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
    });

    // A15: Rejects if task not found
    it("a15: rejects if task not found", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/00000000-0000-0000-0000-000000000000/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A16: SECURITY - Cross-workspace access denied
    it("a16: cross-workspace access denied", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { otherTask } = await setupSecondWorkspace(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${otherTask.id}/activities`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A17: Requires authentication
    it("a17: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/00000000-0000-0000-0000-000000000000/activities",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });

    // A18: Shows all action types
    it("a18: shows all action types", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      // Create activities with different action types
      await db.insert(activities).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_created",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "task_updated",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "comment_added",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          taskId: task.id,
          userId: "user_1",
          action: "assignee_added",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/activities`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(4);
      const actions = json.map((a: { action: string }) => a.action);
      expect(actions).toContain("task_created");
      expect(actions).toContain("task_updated");
      expect(actions).toContain("comment_added");
      expect(actions).toContain("assignee_added");
    });
  });
});
