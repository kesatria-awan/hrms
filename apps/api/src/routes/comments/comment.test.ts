import { applyD1Migrations, env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  activities,
  boardMembers,
  boards,
  columns,
  comments,
  mentions,
  notifications,
  tasks,
  users,
  workspaces,
} from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./comment.handlers";
import * as routes from "./comment.routes";

vi.mock("@/api/lib/notification-email", () => ({
  dispatchNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Create test router with mock auth
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.createComment, handlers.createComment)
    .openapi(routes.listComments, handlers.listComments)
    .openapi(routes.updateComment, handlers.updateComment)
    .openapi(routes.deleteComment, handlers.deleteComment);
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
    {
      id: "user_3",
      email: "user3@example.com",
      firstName: "Bob",
      lastName: "Wilson",
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

// Helper to create a private board for access tests
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

describe("comment routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // Clean up in correct order (respecting foreign keys)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(notifications);
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

  // ==================== POST /tasks/:taskId/comments (C01-C12) ====================
  describe("post /tasks/:taskId/comments", () => {
    // C01: Creates comment with valid content
    it("c01: creates comment with valid content", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "This is a test comment",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.content).toBe("This is a test comment");
      expect(json.taskId).toBe(task.id);
      expect(json.userId).toBe("user_1");
      expect(json.workspaceId).toBe(workspace.id);
    });

    // C02: Parses @mentions and creates mention records
    it("c02: parses @mentions and creates mention records", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Hey @user_2 and @user_3, please review this",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      // Verify mention records were created
      const mentionRecords = await db
        .select()
        .from(mentions)
        .where(eq(mentions.commentId, json.id));

      expect(mentionRecords.length).toBe(2);
      const mentionedUserIds = mentionRecords.map(m => m.userId);
      expect(mentionedUserIds).toContain("user_2");
      expect(mentionedUserIds).toContain("user_3");
    });

    // C03: Ignores @mentions for non-workspace members
    it("c03: ignores @mentions for non-workspace members", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Hey @user_2 and @nonexistent_user, check this",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      // Verify only valid workspace member was mentioned
      const mentionRecords = await db
        .select()
        .from(mentions)
        .where(eq(mentions.commentId, json.id));

      expect(mentionRecords.length).toBe(1);
      expect(mentionRecords[0].userId).toBe("user_2");
    });

    // C04: Board viewer can create comment
    it("c04: board viewer can create comment", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      // Add user_2 as board viewer
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
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Comment from viewer",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.content).toBe("Comment from viewer");
    });

    // C05: Rejects if task not found
    it("c05: rejects if task not found", async () => {
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
        "/tasks/00000000-0000-0000-0000-000000000000/comments",
        {
          method: "POST",
          body: JSON.stringify({
            content: "Test comment",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C06: Rejects if task is soft-deleted
    it("c06: rejects if task is soft-deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Soft delete the task
      await db
        .update(tasks)
        .set({ deletedAt: new Date() })
        .where(eq(tasks.id, task.id));

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Test comment",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C07: Rejects if no board access (private board)
    it("c07: rejects if no board access (private board)", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { privateTask } = await setupPrivateBoard(db, workspace.id);

      // user_2 is not a member of the private board
      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${privateTask.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Test comment",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C08: Requires authentication
    it("c08: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/00000000-0000-0000-0000-000000000000/comments",
        {
          method: "POST",
          body: JSON.stringify({
            content: "Test comment",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(401);
    });

    // C09: SECURITY - Cross-workspace access denied
    it("c09: cross-workspace access denied", async () => {
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
        `/tasks/${otherTask.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Test comment",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C10: Workspace admin can comment on any task
    it("c10: workspace admin can comment on any task", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { privateTask } = await setupPrivateBoard(db, workspace.id);

      // Workspace admin should be able to comment on private board tasks
      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${privateTask.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Admin comment",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
    });

    // C11: Validates content length (max 10000)
    it("c11: validates content length (max 10000)", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "a".repeat(10001),
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      // 422 Unprocessable Entity for validation errors
      expect(response.status).toBe(422);
    });

    // C12: Creates activity record for comment_added
    it("c12: creates activity record for comment_added", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            content: "Test comment for activity",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      // Verify activity record
      const [activity] = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.taskId, task.id),
            eq(activities.action, "comment_added"),
          ),
        );

      expect(activity).toBeDefined();
      expect(activity.userId).toBe("user_1");
      expect(activity.boardId).toBe(board.id);
      expect(activity.workspaceId).toBe(workspace.id);
      expect(activity.metadata).toBeDefined();
      const metadata = activity.metadata as { commentId: string };
      expect(metadata.commentId).toBe(json.id);
    });
  });

  // ==================== GET /tasks/:taskId/comments (C13-C20) ====================
  describe("get /tasks/:taskId/comments", () => {
    // C13: Returns comments ordered by createdAt DESC
    it("c13: returns comments ordered by createdAt DESC", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create comments with different timestamps
      await db.insert(comments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "First comment",
          createdAt: new Date("2024-01-01"),
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Second comment",
          createdAt: new Date("2024-01-02"),
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Third comment",
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
        `/tasks/${task.id}/comments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(3);
      expect(json[0].content).toBe("Third comment");
      expect(json[1].content).toBe("Second comment");
      expect(json[2].content).toBe("First comment");
    });

    // C14: Includes user info (firstName, lastName, imageUrl)
    it("c14: includes user info (firstName, lastName, imageUrl)", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(comments).values({
        workspaceId: workspace.id,
        taskId: task.id,
        userId: "user_1",
        content: "Test comment",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
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

    // C15: Includes mentions with user info
    it("c15: includes mentions with user info", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Hey @user_2, check this",
        })
        .returning();

      await db.insert(mentions).values({
        commentId: comment.id,
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
        `/tasks/${task.id}/comments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].mentions).toBeDefined();
      expect(json[0].mentions.length).toBe(1);
      expect(json[0].mentions[0].userId).toBe("user_2");
      expect(json[0].mentions[0].user.firstName).toBe("Jane");
      expect(json[0].mentions[0].user.lastName).toBe("Smith");
    });

    // C16: Excludes soft-deleted comments
    it("c16: excludes soft-deleted comments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(comments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Visible comment",
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Deleted comment",
          deletedAt: new Date(),
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
        `/tasks/${task.id}/comments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
      expect(json[0].content).toBe("Visible comment");
    });

    // C17: Board viewer can list comments
    it("c17: board viewer can list comments", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      await db.insert(comments).values({
        workspaceId: workspace.id,
        taskId: task.id,
        userId: "user_1",
        content: "Test comment",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
    });

    // C18: Rejects if task not found
    it("c18: rejects if task not found", async () => {
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
        "/tasks/00000000-0000-0000-0000-000000000000/comments",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C19: SECURITY - Cross-workspace access denied
    it("c19: cross-workspace access denied", async () => {
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
        `/tasks/${otherTask.id}/comments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C20: Requires authentication
    it("c20: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/00000000-0000-0000-0000-000000000000/comments",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== PATCH /comments/:id (C21-C30) ====================
  describe("patch /comments/:id", () => {
    // C21: Author can update own comment
    it("c21: author can update own comment", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_2",
          content: "Original content",
        })
        .returning();

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Updated content",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.content).toBe("Updated content");
    });

    // C22: Updates mentions when content changes
    it("c22: updates mentions when content changes", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Hey @user_2",
        })
        .returning();

      await db.insert(mentions).values({
        commentId: comment.id,
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
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Hey @user_3 instead",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);

      // Verify mentions were updated
      const mentionRecords = await db
        .select()
        .from(mentions)
        .where(eq(mentions.commentId, comment.id));

      expect(mentionRecords.length).toBe(1);
      expect(mentionRecords[0].userId).toBe("user_3");
    });

    // C23: Board owner cannot update others' comments
    it("c23: board owner cannot update others' comments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_2",
          content: "Original content",
        })
        .returning();

      // user_1 is board owner but not comment author
      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Trying to update",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    // C24: Workspace admin cannot update others' comments
    it("c24: workspace admin cannot update others' comments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_2",
          content: "Original content",
        })
        .returning();

      // user_1 is workspace admin but not comment author
      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Trying to update",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    // C25: Rejects if comment not found
    it("c25: rejects if comment not found", async () => {
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
        "/comments/00000000-0000-0000-0000-000000000000",
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Updated content",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C26: Rejects if comment is soft-deleted
    it("c26: rejects if comment is soft-deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Deleted comment",
          deletedAt: new Date(),
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
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Updated content",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C27: Rejects if not comment author
    it("c27: rejects if not comment author", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Original content",
        })
        .returning();

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Trying to update",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    // C28: SECURITY - Cross-workspace access denied
    it("c28: cross-workspace access denied", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, otherTask } = await setupSecondWorkspace(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace2.id,
          taskId: otherTask.id,
          userId: "user_other",
          content: "Other workspace comment",
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
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Trying to update",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C29: Requires authentication
    it("c29: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/comments/00000000-0000-0000-0000-000000000000",
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Updated content",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(401);
    });

    // C30: Sets updatedAt timestamp
    it("c30: sets updatedAt timestamp", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const originalDate = new Date("2024-01-01");
      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Original content",
          createdAt: originalDate,
          updatedAt: originalDate,
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
        `/comments/${comment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: "Updated content",
          }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(new Date(json.updatedAt).getTime()).toBeGreaterThan(
        originalDate.getTime(),
      );
    });
  });

  // ==================== DELETE /comments/:id (C31-C40) ====================
  describe("delete /comments/:id", () => {
    // C31: Author can delete own comment
    it("c31: author can delete own comment", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_2",
          content: "My comment",
        })
        .returning();

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // C32: Board owner can delete any comment
    it("c32: board owner can delete any comment", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_2",
          content: "Someone else's comment",
        })
        .returning();

      // user_1 is board owner
      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // C33: Workspace admin can delete any comment
    it("c33: workspace admin can delete any comment", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      // Create a new board where user_1 is NOT the owner
      const [newBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: "Another Board",
          color: "#10B981",
          visibility: "workspace",
          createdById: "user_2",
          position: 1,
        })
        .returning();

      await db.insert(boardMembers).values({
        boardId: newBoard.id,
        userId: "user_2",
        role: "admin",
      });

      const [newColumn] = await db
        .insert(columns)
        .values({
          boardId: newBoard.id,
          name: "To Do",
          position: 0,
          isDefault: true,
          isDoneColumn: false,
        })
        .returning();

      const [newTask] = await db
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          boardId: newBoard.id,
          columnId: newColumn.id,
          title: "New Task",
          position: 0,
          createdById: "user_2",
        })
        .returning();

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: newTask.id,
          userId: "user_2",
          content: "Comment on another board",
        })
        .returning();

      // user_1 is workspace admin but not board owner
      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // C34: Board viewer cannot delete others' comments
    it("c34: board viewer cannot delete others' comments", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Owner's comment",
        })
        .returning();

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(403);
    });

    // C35: Rejects if comment not found
    it("c35: rejects if comment not found", async () => {
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
        "/comments/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C36: Rejects if already deleted
    it("c36: rejects if already deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Deleted comment",
          deletedAt: new Date(),
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
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C37: SECURITY - Cross-workspace access denied
    it("c37: cross-workspace access denied", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, otherTask } = await setupSecondWorkspace(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace2.id,
          taskId: otherTask.id,
          userId: "user_other",
          content: "Other workspace comment",
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
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // C38: Requires authentication
    it("c38: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/comments/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(401);
    });

    // C39: Soft deletes (sets deletedAt)
    it("c39: soft deletes (sets deletedAt)", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "To be deleted",
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
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);

      // Verify soft delete
      const [deleted] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, comment.id));

      expect(deleted.deletedAt).not.toBeNull();
    });

    // C40: Creates activity record for comment_deleted
    it("c40: creates activity record for comment_deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "To be deleted",
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
        `/comments/${comment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);

      // Verify activity record
      const [activity] = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.taskId, task.id),
            eq(activities.action, "comment_deleted"),
          ),
        );

      expect(activity).toBeDefined();
      expect(activity.userId).toBe("user_1");
      expect(activity.boardId).toBe(board.id);
      expect(activity.metadata).toBeDefined();
      const metadata = activity.metadata as { commentId: string };
      expect(metadata.commentId).toBe(comment.id);
    });
  });

  // ==================== NOTIFICATION TESTS (CM-N01 to CM-N03) ====================
  describe("comment mention notifications", () => {
    // CM-N01: Creating comment with @mention creates notification
    it("cm-n01: creating comment with @mention creates notification", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content: "Hey @user_2 check this out!" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);

      // Verify notification was created for the mentioned user
      const notificationList = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_2"));

      expect(notificationList.length).toBe(1);
      expect(notificationList[0].type).toBe("mention");
      expect(notificationList[0].resourceType).toBe("comment");
      expect(notificationList[0].title).toContain("mentioned");
    });

    // CM-N02: Self-mention does not create notification
    it("cm-n02: self-mention does not create notification", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content: "Note to @user_1 myself" }),
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

    // CM-N03: Multiple mentions create multiple notifications
    it("cm-n03: multiple mentions create multiple notifications", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // user_3 is already created in setupTestData

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content: "Hey @user_2 and @user_3 check this!" }),
          headers: new Headers({ "Content-Type": "application/json" }),
        },
        env,
      );

      expect(response.status).toBe(201);

      // Verify notifications were created for both mentioned users
      const user2Notifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_2"));

      const user3Notifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_3"));

      expect(user2Notifications.length).toBe(1);
      expect(user3Notifications.length).toBe(1);
      expect(user2Notifications[0].type).toBe("mention");
      expect(user3Notifications[0].type).toBe("mention");
    });
  });
});
