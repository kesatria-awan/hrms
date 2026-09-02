import { applyD1Migrations, env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  boardMembers,
  boards,
  columns,
  notifications,
  taskAssignees,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./task.handlers";
import * as routes from "./task.routes";

vi.mock("@/api/lib/notification-email", () => ({
  dispatchNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Create test router with mock auth
// Route order matters: /tasks/reorder must come before /tasks/{id}
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.createTask, handlers.createTask)
    .openapi(routes.listTasks, handlers.listTasks)
    .openapi(routes.reorderTasks, handlers.reorderTasks) // Before :id routes
    .openapi(routes.getTask, handlers.getTask)
    .openapi(routes.updateTask, handlers.updateTask)
    .openapi(routes.deleteTask, handlers.deleteTask)
    .openapi(routes.moveTask, handlers.moveTask)
    .openapi(routes.archiveTask, handlers.archiveTask)
    .openapi(routes.unarchiveTask, handlers.unarchiveTask)
    .openapi(routes.assignUser, handlers.assignUser)
    .openapi(routes.unassignUser, handlers.unassignUser);
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
      workspaceId: workspace.id,
      role: "workspace_admin",
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
      role: "member",
    },
  ]);

  // Create workspace members
  await db.insert(workspaceMembers).values([
    { workspaceId: workspace.id, userId: "user_1", role: "admin" },
    { workspaceId: workspace.id, userId: "user_2", role: "member" },
    { workspaceId: workspace.id, userId: "user_3", role: "member" },
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

  // Create columns
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

  const [inProgressColumn] = await db
    .insert(columns)
    .values({
      boardId: board.id,
      name: "In Progress",
      position: 1,
      isDefault: false,
      isDoneColumn: false,
    })
    .returning();

  const [doneColumn] = await db
    .insert(columns)
    .values({
      boardId: board.id,
      name: "Done",
      position: 2,
      isDefault: false,
      isDoneColumn: true,
    })
    .returning();

  return { workspace, board, todoColumn, inProgressColumn, doneColumn };
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

  return { workspace2, board2, otherColumn };
}

describe("task routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // Clean up in correct order (respecting foreign keys)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(notifications);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(taskAssignees);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(tasks);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boardMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(columns);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boards);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaceMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  // ==================== POST /tasks (T01-T11) ====================
  describe("pOST /tasks", () => {
    // T01: Creates task with all required fields
    it("t01: creates task with all required fields", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: todoColumn.id,
            title: "Test Task",
            description: "Task description",
            priority: "high",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.title).toBe("Test Task");
      expect(json.description).toBe("Task description");
      expect(json.priority).toBe("high");
      expect(json.workspaceId).toBe(workspace.id);
      expect(json.boardId).toBe(board.id);
      expect(json.columnId).toBe(todoColumn.id);
      expect(json.createdById).toBe("user_1");
    });

    // T02: Creates task with minimal fields (defaults applied)
    it("t02: creates task with minimal fields and defaults", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: todoColumn.id,
            title: "Minimal Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.title).toBe("Minimal Task");
      expect(json.priority).toBe("medium"); // default
      expect(json.description).toBeNull();
    });

    // T03: Board member can create tasks
    it("t03: board member can create task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      // Add user_2 as member
      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: todoColumn.id,
            title: "Test Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
    });

    // T04: Rejects if board not found
    it("t04: rejects if board not found", async () => {
      const db = createDb(typedEnv);
      const { workspace, todoColumn } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: "00000000-0000-0000-0000-000000000000",
            columnId: todoColumn.id,
            title: "Test Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T05: Rejects if column not found
    it("t05: rejects if column not found", async () => {
      const db = createDb(typedEnv);
      const { workspace, board } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: "00000000-0000-0000-0000-000000000000",
            title: "Test Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T06: Rejects if column belongs to different board
    it("t06: rejects if column belongs to different board", async () => {
      const db = createDb(typedEnv);
      const { workspace, board } = await setupTestData(db);

      // Create another board with a column
      const [otherBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: "Other Board",
          color: "#10B981",
          visibility: "workspace",
          createdById: "user_1",
          position: 1,
        })
        .returning();

      const [otherColumn] = await db
        .insert(columns)
        .values({
          boardId: otherBoard.id,
          name: "Other Column",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: otherColumn.id, // Column from different board
            title: "Test Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(400);
    });

    // T07: Requires authentication
    it("t07: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: "00000000-0000-0000-0000-000000000000",
            columnId: "00000000-0000-0000-0000-000000000000",
            title: "Test Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(401);
    });

    // T08: SECURITY - User from workspace A cannot create in workspace B
    it("t08: user from workspace A cannot create task in workspace B", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { board2, otherColumn } = await setupSecondWorkspace(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id, // User is in workspace 1
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board2.id, // Board from workspace 2
            columnId: otherColumn.id,
            title: "Test Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T09: Workspace admin can create in any board
    it("t09: workspace admin can create task in any board", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      // Create a private board owned by user_2
      const [privateBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: "Private Board",
          color: "#EC4899",
          visibility: "private",
          createdById: "user_2",
          position: 1,
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: privateBoard.id,
        userId: "user_2",
        role: "admin",
      });

      const [privateColumn] = await db
        .insert(columns)
        .values({
          boardId: privateBoard.id,
          name: "Private Column",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        })
        .returning();

      // Workspace admin should be able to create task
      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: privateBoard.id,
            columnId: privateColumn.id,
            title: "Admin Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
    });

    // T10: workspace_id auto-populated from board.workspace_id
    it("t10: workspace_id is auto-populated from board", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: todoColumn.id,
            title: "Test Task",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.workspaceId).toBe(workspace.id);

      // Verify in DB
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, json.id));
      expect(task.workspaceId).toBe(workspace.id);
    });

    // T11: Position set as next available in column
    it("t11: position is set as next available in column", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      // Create existing tasks
      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 1",
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 2",
          position: 1,
          createdById: "user_1",
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
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: todoColumn.id,
            title: "Task 3",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.position).toBe(2); // Next available position
    });
  });

  // ==================== GET /tasks (T12-T21) ====================
  describe("gET /tasks", () => {
    // T12: Returns tasks filtered by boardId
    it("t12: returns tasks filtered by boardId", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      // Create tasks
      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 1",
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 2",
          position: 1,
          createdById: "user_1",
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
        `/tasks?boardId=${board.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(2);
    });

    // T13: Returns tasks filtered by assignee
    it("t13: returns tasks filtered by assignee", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task1] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Assigned Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(tasks).values({
        workspaceId: workspace.id,
        boardId: board.id,
        columnId: todoColumn.id,
        title: "Unassigned Task",
        position: 1,
        createdById: "user_1",
      });

      await db.insert(taskAssignees).values({
        taskId: task1.id,
        userId: "user_2",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks?boardId=${board.id}&assigneeId=user_2`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
      expect(json[0].title).toBe("Assigned Task");
    });

    // T14: Returns tasks filtered by priority
    it("t14: returns tasks filtered by priority", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "High Priority",
          priority: "high",
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Low Priority",
          priority: "low",
          position: 1,
          createdById: "user_1",
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
        `/tasks?boardId=${board.id}&priority=high`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
      expect(json[0].title).toBe("High Priority");
    });

    // T15: Returns tasks filtered by due_date range
    it("t15: returns tasks filtered by due_date range", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Due Tomorrow",
          dueDate: tomorrow,
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Due Next Week",
          dueDate: nextWeek,
          position: 1,
          createdById: "user_1",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const dueBefore = new Date();
      dueBefore.setDate(dueBefore.getDate() + 3);

      const response = await router.request(
        `/tasks?boardId=${board.id}&dueBefore=${dueBefore.toISOString()}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
      expect(json[0].title).toBe("Due Tomorrow");
    });

    // T16: Excludes archived tasks by default
    it("t16: excludes archived tasks by default", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Active Task",
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Archived Task",
          position: 1,
          archivedAt: new Date(),
          createdById: "user_1",
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
        `/tasks?boardId=${board.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
      expect(json[0].title).toBe("Active Task");
    });

    // T17: Includes archived when ?archived=true
    it("t17: includes archived tasks when archived=true", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Active Task",
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Archived Task",
          position: 1,
          archivedAt: new Date(),
          createdById: "user_1",
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
        `/tasks?boardId=${board.id}&archived=true`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
      expect(json[0].title).toBe("Archived Task");
    });

    // T18: Excludes soft-deleted tasks
    it("t18: excludes soft-deleted tasks", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Active Task",
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Deleted Task",
          position: 1,
          deletedAt: new Date(),
          createdById: "user_1",
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
        `/tasks?boardId=${board.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
      expect(json[0].title).toBe("Active Task");
    });

    // T19: SECURITY - Returns only tasks from user's workspace
    it("t19: returns only tasks from user's workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      await db.insert(tasks).values([
        {
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "My Task",
          position: 0,
          createdById: "user_1",
        },
        {
          workspaceId: workspace2.id,
          boardId: board2.id,
          columnId: otherColumn.id,
          title: "Other Task",
          position: 0,
          createdById: "user_other",
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
        `/tasks?boardId=${board.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
      expect(json[0].title).toBe("My Task");
    });

    // T20: Viewer can list tasks on accessible board
    it("t20: viewer can list tasks on accessible board", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      await db.insert(tasks).values({
        workspaceId: workspace.id,
        boardId: board.id,
        columnId: todoColumn.id,
        title: "Task",
        position: 0,
        createdById: "user_1",
      });

      // Add user_2 as viewer
      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks?boardId=${board.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveLength(1);
    });

    // T21: Requires authentication
    it("t21: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks?boardId=00000000-0000-0000-0000-000000000000",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== GET /tasks/:id (T22-T27) ====================
  describe("gET /tasks/:id", () => {
    // T22: Returns task with assignees array
    it("t22: returns task with assignees array", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task with Assignees",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(taskAssignees).values([
        { taskId: task.id, userId: "user_1" },
        { taskId: task.id, userId: "user_2" },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.title).toBe("Task with Assignees");
      expect(json.assignees).toHaveLength(2);
    });

    // T23: Returns 404 if task not found
    it("t23: returns 404 if task not found", async () => {
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
        "/tasks/00000000-0000-0000-0000-000000000000",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T24: Returns 404 if task soft-deleted
    it("t24: returns 404 if task is soft-deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Deleted Task",
          position: 0,
          deletedAt: new Date(),
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T25: SECURITY - Cannot view task in different workspace
    it("t25: cannot view task in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace2.id,
          boardId: board2.id,
          columnId: otherColumn.id,
          title: "Other Workspace Task",
          position: 0,
          createdById: "user_other",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T26: Viewer can view task on accessible board
    it("t26: viewer can view task on accessible board", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T27: Cannot view task on private board without membership
    it("t27: cannot view task on private board without membership", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      // Create private board
      const [privateBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: "Private Board",
          color: "#EC4899",
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
          name: "Private Column",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        })
        .returning();

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: privateBoard.id,
          columnId: privateColumn.id,
          title: "Private Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      // user_2 is not a member of private board
      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });
  });

  // ==================== PATCH /tasks/:id (T28-T37) ====================
  describe("pATCH /tasks/:id", () => {
    // T28: Updates task title
    it("t28: updates task title", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Old Title",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "New Title" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.title).toBe("New Title");
    });

    // T29: Updates task description
    it("t29: updates task description", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ description: "New description" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.description).toBe("New description");
    });

    // T30: Updates task priority
    it("t30: updates task priority", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          priority: "medium",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ priority: "high" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.priority).toBe("high");
    });

    // T31: Updates task due_date
    it("t31: updates task due_date", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const dueDate = new Date("2025-12-31T23:59:59Z");

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ dueDate: dueDate.toISOString() }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(new Date(json.dueDate).toISOString()).toBe(dueDate.toISOString());
    });

    // T32: Board member can update task
    it("t32: board member can update task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "New Title" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T33: Owner/editor can update
    it("t33: board owner can update task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_2",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Updated" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T34: SECURITY - Cannot update task in different workspace
    it("t34: cannot update task in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
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

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Hacked" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T35: Workspace admin can update any task
    it("t35: workspace admin can update any task", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      // Create private board owned by user_2
      const [privateBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: "Private Board",
          color: "#EC4899",
          visibility: "private",
          createdById: "user_2",
          position: 1,
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: privateBoard.id,
        userId: "user_2",
        role: "admin",
      });

      const [privateColumn] = await db
        .insert(columns)
        .values({
          boardId: privateBoard.id,
          name: "Private Column",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        })
        .returning();

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: privateBoard.id,
          columnId: privateColumn.id,
          title: "Private Task",
          position: 0,
          createdById: "user_2",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Updated by Admin" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T36: Cannot change column_id via PATCH (use /move)
    it("t36: cannot change column_id via PATCH", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn, inProgressColumn }
        = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ columnId: inProgressColumn.id }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      // Should either be 400 or ignore the columnId field
      if (response.status === 200) {
        const json = await response.json();
        expect(json.columnId).toBe(todoColumn.id); // Should not have changed
      }
      else {
        expect(response.status).toBe(400);
      }
    });

    // T37: Cannot change workspace_id
    it("t37: cannot change workspace_id via PATCH", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);
      const { workspace2 } = await setupSecondWorkspace(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ workspaceId: workspace2.id }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      // Should either be 400 or ignore the workspaceId field
      if (response.status === 200) {
        const json = await response.json();
        expect(json.workspaceId).toBe(workspace.id); // Should not have changed
      }
      else {
        expect(response.status).toBe(400);
      }
    });
  });

  // ==================== DELETE /tasks/:id (T38-T43) ====================
  describe("dELETE /tasks/:id", () => {
    // T38: Soft deletes task
    it("t38: soft deletes task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task to Delete",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);

      // Verify soft delete
      const [deleted] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(deleted.deletedAt).not.toBeNull();
    });

    // T39: Board member cannot delete task (admin-only)
    it("t39: board member cannot delete task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(403);
    });

    // T40: Owner/editor can delete
    it("t40: board owner can delete task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_2",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // T41: SECURITY - Cannot delete in different workspace
    it("t41: cannot delete task in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
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

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T42: Workspace admin can delete any task
    it("t42: workspace admin can delete any task", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      const [privateBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: "Private Board",
          color: "#EC4899",
          visibility: "private",
          createdById: "user_2",
          position: 1,
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: privateBoard.id,
        userId: "user_2",
        role: "admin",
      });

      const [privateColumn] = await db
        .insert(columns)
        .values({
          boardId: privateBoard.id,
          name: "Private Column",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        })
        .returning();

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: privateBoard.id,
          columnId: privateColumn.id,
          title: "Private Task",
          position: 0,
          createdById: "user_2",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // T43: Already deleted task returns 404
    it("t43: already deleted task returns 404", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Deleted Task",
          position: 0,
          deletedAt: new Date(),
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });
  });

  // ==================== PATCH /tasks/:id/move (T44-T50) ====================
  describe("pATCH /tasks/:id/move", () => {
    // T44: Moves task to different column
    it("t44: moves task to different column", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn, inProgressColumn }
        = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task to Move",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            columnId: inProgressColumn.id,
            position: 0,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.columnId).toBe(inProgressColumn.id);
    });

    // T45: Sets position in target column
    it("t45: sets position in target column", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn, inProgressColumn }
        = await setupTestData(db);

      // Create existing task in target column
      await db.insert(tasks).values({
        workspaceId: workspace.id,
        boardId: board.id,
        columnId: inProgressColumn.id,
        title: "Existing Task",
        position: 0,
        createdById: "user_1",
      });

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task to Move",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            columnId: inProgressColumn.id,
            position: 1,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.position).toBe(1);
    });

    // T46: EDGE - Moving to Done column sets completed_at
    it("t46: moving to Done column sets completed_at", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn, doneColumn }
        = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task to Complete",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      expect(task.completedAt).toBeNull();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            columnId: doneColumn.id,
            position: 0,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.completedAt).not.toBeNull();
    });

    // T47: EDGE - Moving from Done clears completed_at
    it("t47: moving from Done column clears completed_at", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn, doneColumn }
        = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: doneColumn.id,
          title: "Completed Task",
          position: 0,
          completedAt: new Date(),
          createdById: "user_1",
        })
        .returning();

      expect(task.completedAt).not.toBeNull();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            columnId: todoColumn.id,
            position: 0,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.completedAt).toBeNull();
    });

    // T48: Cannot move to column in different board
    it("t48: cannot move to column in different board", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      // Create another board with column
      const [otherBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: "Other Board",
          color: "#10B981",
          visibility: "workspace",
          createdById: "user_1",
          position: 1,
        })
        .returning();

      const [otherColumn] = await db
        .insert(columns)
        .values({
          boardId: otherBoard.id,
          name: "Other Column",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        })
        .returning();

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            columnId: otherColumn.id,
            position: 0,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(400);
    });

    // T49: Board member can move task
    it("t49: board member can move task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn, inProgressColumn }
        = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            columnId: inProgressColumn.id,
            position: 0,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T50: SECURITY - Cannot move task in different workspace
    it("t50: cannot move task in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace, inProgressColumn } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
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

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            columnId: inProgressColumn.id,
            position: 0,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });
  });

  // ==================== PATCH /tasks/:id/archive & unarchive (T51-T58) ====================
  describe("pATCH /tasks/:id/archive", () => {
    // T51: Archives task
    it("t51: archives task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task to Archive",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/archive`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.archivedAt).not.toBeNull();
    });

    // T52: Already archived returns 409 or idempotent 200
    it("t52: already archived task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Archived Task",
          position: 0,
          archivedAt: new Date(),
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/archive`,
        { method: "PATCH" },
        env,
      );

      // Accept either 409 (conflict) or 200 (idempotent)
      expect([200, 409]).toContain(response.status);
    });

    // T53: Board member can archive task
    it("t53: board member can archive task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/archive`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T54: SECURITY - Cannot archive in different workspace
    it("t54: cannot archive task in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
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

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/archive`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("pATCH /tasks/:id/unarchive", () => {
    // T55: Unarchives task
    it("t55: unarchives task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Archived Task",
          position: 0,
          archivedAt: new Date(),
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/unarchive`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.archivedAt).toBeNull();
    });

    // T56: Non-archived returns 409 or idempotent 200
    it("t56: unarchive non-archived task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Active Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/unarchive`,
        { method: "PATCH" },
        env,
      );

      // Accept either 409 (conflict) or 200 (idempotent)
      expect([200, 409]).toContain(response.status);
    });

    // T57: Board member can unarchive task
    it("t57: board member can unarchive task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Archived Task",
          position: 0,
          archivedAt: new Date(),
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/unarchive`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T58: SECURITY - Cannot unarchive in different workspace
    it("t58: cannot unarchive task in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace2.id,
          boardId: board2.id,
          columnId: otherColumn.id,
          title: "Other Archived Task",
          position: 0,
          archivedAt: new Date(),
          createdById: "user_other",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/unarchive`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(404);
    });
  });

  // ==================== PATCH /tasks/reorder (T59-T62) ====================
  describe("pATCH /tasks/reorder", () => {
    // T59: Reorders tasks within column
    it("t59: reorders tasks within column", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task1] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 1",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const [task2] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 2",
          position: 1,
          createdById: "user_1",
        })
        .returning();

      const [task3] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 3",
          position: 2,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      // Reorder: task3, task1, task2
      const response = await router.request(
        "/tasks/reorder",
        {
          method: "PATCH",
          body: JSON.stringify({
            taskIds: [task3.id, task1.id, task2.id],
            columnId: todoColumn.id,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);

      // Verify positions
      const updatedTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.columnId, todoColumn.id));
      const task1Updated = updatedTasks.find(t => t.id === task1.id);
      const task2Updated = updatedTasks.find(t => t.id === task2.id);
      const task3Updated = updatedTasks.find(t => t.id === task3.id);

      expect(task3Updated?.position).toBe(0);
      expect(task1Updated?.position).toBe(1);
      expect(task2Updated?.position).toBe(2);
    });

    // T60: Validates all task IDs belong to same column
    it("t60: validates all task IDs belong to same column", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn, inProgressColumn }
        = await setupTestData(db);

      const [task1] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 1",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const [task2] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: inProgressColumn.id, // Different column!
          title: "Task 2",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/reorder",
        {
          method: "PATCH",
          body: JSON.stringify({
            taskIds: [task1.id, task2.id],
            columnId: todoColumn.id,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(400);
    });

    // T61: Board member can reorder tasks
    it("t61: board member can reorder tasks", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task1] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task 1",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/reorder",
        {
          method: "PATCH",
          body: JSON.stringify({
            taskIds: [task1.id],
            columnId: todoColumn.id,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
    });

    // T62: SECURITY - Cannot reorder in different workspace
    it("t62: cannot reorder tasks in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
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

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/reorder",
        {
          method: "PATCH",
          body: JSON.stringify({
            taskIds: [task.id],
            columnId: otherColumn.id,
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });
  });

  // ==================== POST /tasks/:id/assignees (T63-T67) ====================
  describe("pOST /tasks/:id/assignees", () => {
    // T63: Assigns user to task
    it("t63: assigns user to task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees`,
        {
          method: "POST",
          body: JSON.stringify({ userId: "user_2" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.userId).toBe("user_2");
      expect(json.taskId).toBe(task.id);
    });

    // T64: Cannot assign user not in workspace
    it("t64: cannot assign user not in workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees`,
        {
          method: "POST",
          body: JSON.stringify({ userId: "user_nonexistent" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect([400, 404]).toContain(response.status);
    });

    // T65: Cannot assign duplicate
    it("t65: cannot assign duplicate", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(taskAssignees).values({
        taskId: task.id,
        userId: "user_2",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees`,
        {
          method: "POST",
          body: JSON.stringify({ userId: "user_2" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(409);
    });

    // T66: Board member can assign user to task
    it("t66: board member can assign user to task", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees`,
        {
          method: "POST",
          body: JSON.stringify({ userId: "user_3" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
    });

    // T67: SECURITY - Cannot assign in different workspace
    it("t67: cannot assign user to task in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
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

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees`,
        {
          method: "POST",
          body: JSON.stringify({ userId: "user_1" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // TA-N01: Assigning user creates notification for assignee
    it("ta-n01: assigning user creates notification for assignee", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task to assign",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees`,
        {
          method: "POST",
          body: JSON.stringify({ userId: "user_2" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);

      // Verify notification was created for the assignee
      const notificationList = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_2"));

      expect(notificationList.length).toBe(1);
      expect(notificationList[0].type).toBe("assignment");
      expect(notificationList[0].resourceType).toBe("task");
      expect(notificationList[0].resourceId).toBe(task.id);
    });

    // TA-N02: Self-assignment does not create notification
    it("ta-n02: self-assignment does not create notification", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task to self-assign",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees`,
        {
          method: "POST",
          body: JSON.stringify({ userId: "user_1" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);

      // Verify no notification was created
      const notificationList = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_1"));

      expect(notificationList.length).toBe(0);
    });
  });

  // ==================== DELETE /tasks/:id/assignees/:userId (T68-T71) ====================
  describe("dELETE /tasks/:id/assignees/:userId", () => {
    // T68: Removes user assignment
    it("t68: removes user assignment", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(taskAssignees).values({
        taskId: task.id,
        userId: "user_2",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees/user_2`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);

      // Verify removal
      const [assignment] = await db
        .select()
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, task.id),
            eq(taskAssignees.userId, "user_2"),
          ),
        );
      expect(assignment).toBeUndefined();
    });

    // T69: Returns 404 if assignment not found
    it("t69: returns 404 if assignment not found", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees/user_nonexistent`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // T70: Board member can unassign user
    it("t70: board member can unassign user", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Task",
          position: 0,
          createdById: "user_1",
        })
        .returning();

      await db.insert(taskAssignees).values({
        taskId: task.id,
        userId: "user_3",
      });

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees/user_3`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // T71: SECURITY - Cannot unassign in different workspace
    it("t71: cannot unassign user in different workspace", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, board2, otherColumn } = await setupSecondWorkspace(db);

      const [task] = await db
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

      await db.insert(taskAssignees).values({
        taskId: task.id,
        userId: "user_other",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/assignees/user_other`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });
  });

  // ==================== dueDateEmailSent Reset Tests ====================
  describe("dueDateEmailSent reset on dueDate change", () => {
    // D17-01: updateTask with dueDate change resets dueDateEmailSent to false for all assignees
    it("d17-01: resets dueDateEmailSent when dueDate changes", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      // Create task with a due date
      const originalDue = new Date("2026-04-01T00:00:00.000Z");
      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "Due Date Task",
          dueDate: originalDue,
          position: 0,
          createdById: "user_1",
        })
        .returning();

      // Assign user_2 with dueDateEmailSent=true
      const [assignee] = await db
        .insert(taskAssignees)
        .values({
          taskId: task.id,
          userId: "user_2",
          dueDateEmailSent: true,
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      // Update the due date
      const newDue = new Date("2026-05-01T00:00:00.000Z");
      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ dueDate: newDue.toISOString() }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);

      // Check that dueDateEmailSent was reset to false
      const [updatedAssignee] = await db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.id, assignee.id))
        .limit(1);

      expect(updatedAssignee.dueDateEmailSent).toBe(false);
    });

    // D17-02: updateTask without dueDate change does NOT reset dueDateEmailSent
    it("d17-02: does not reset dueDateEmailSent when dueDate does not change", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, todoColumn } = await setupTestData(db);

      // Create task with a due date
      const [task] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: board.id,
          columnId: todoColumn.id,
          title: "No Due Date Change",
          dueDate: new Date("2026-04-01T00:00:00.000Z"),
          position: 0,
          createdById: "user_1",
        })
        .returning();

      // Assign user_2 with dueDateEmailSent=true
      const [assignee] = await db
        .insert(taskAssignees)
        .values({
          taskId: task.id,
          userId: "user_2",
          dueDateEmailSent: true,
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      // Update title only (no dueDate change)
      const response = await router.request(
        `/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Updated Title" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);

      // Check that dueDateEmailSent was NOT reset
      const [updatedAssignee] = await db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.id, assignee.id))
        .limit(1);

      expect(updatedAssignee.dueDateEmailSent).toBe(true);
    });
  });
});
