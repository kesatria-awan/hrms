import { applyD1Migrations, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  boardMembers,
  boards,
  columns,
  comments,
  notifications,
  tasks,
  users,
  workspaces,
} from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import {
  createAssignmentNotification,
  createMentionNotification,
  createNotification,
} from "@/api/lib/notifications";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./notification.handlers";
import * as routes from "./notification.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Create test router with mock auth
function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.listNotifications, handlers.listNotifications)
    .openapi(routes.markNotificationRead, handlers.markNotificationRead)
    .openapi(routes.markAllNotificationsRead, handlers.markAllNotificationsRead)
    .openapi(routes.getUnreadCount, handlers.getUnreadCount);
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

describe("notification routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // Clean up in correct order (respecting foreign keys)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(notifications);
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

  // ==================== SCHEMA TESTS (N01-N02) ====================
  describe("schema", () => {
    // N01: Notification table has correct structure
    it("n01: notification table has correct structure", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      const [notification] = await db
        .insert(notifications)
        .values({
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Test notification",
        })
        .returning();

      expect(notification.id).toBeDefined();
      expect(notification.userId).toBe("user_1");
      expect(notification.workspaceId).toBe(workspace.id);
      expect(notification.type).toBe("assignment");
      expect(notification.title).toBe("Test notification");
      expect(notification.isRead).toBe(false);
      expect(notification.createdAt).toBeInstanceOf(Date);
    });

    // N02: Notification types enum includes all values
    it("n02: notification types enum includes all values", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Test all notification types
      const types = ["mention", "assignment", "due_date", "task_overdue"] as const;

      for (const type of types) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: "user_1",
            workspaceId: workspace.id,
            type,
            title: `Test ${type} notification`,
            resourceType: "task",
            resourceId: task.id,
          })
          .returning();

        expect(notification.type).toBe(type);
      }
    });
  });

  // ==================== HELPER LIBRARY TESTS (NH01-NH05) ====================
  describe("helper library", () => {
    // NH01: createNotification creates a notification record
    it("nh01: createNotification creates a notification record", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const notification = await createNotification({
        db,
        userId: "user_1",
        workspaceId: workspace.id,
        type: "assignment",
        title: "You were assigned a task",
        body: "Test Task has been assigned to you",
        resourceType: "task",
        resourceId: task.id,
      });

      expect(notification).toBeDefined();
      expect(notification!.userId).toBe("user_1");
      expect(notification!.type).toBe("assignment");
      expect(notification!.title).toBe("You were assigned a task");
      expect(notification!.resourceType).toBe("task");
      expect(notification!.resourceId).toBe(task.id);
    });

    // NH02: createAssignmentNotification creates correct notification
    it("nh02: createAssignmentNotification creates correct notification", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const notification = await createAssignmentNotification({
        db,
        assigneeId: "user_2",
        assignerId: "user_1",
        taskId: task.id,
        taskTitle: task.title,
        workspaceId: workspace.id,
      });

      expect(notification).toBeDefined();
      expect(notification!.userId).toBe("user_2");
      expect(notification!.type).toBe("assignment");
      expect(notification!.title).toContain("assigned");
      expect(notification!.resourceType).toBe("task");
      expect(notification!.resourceId).toBe(task.id);
    });

    // NH03: createAssignmentNotification skips self-assignment
    it("nh03: createAssignmentNotification skips self-assignment", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const notification = await createAssignmentNotification({
        db,
        assigneeId: "user_1",
        assignerId: "user_1",
        taskId: task.id,
        taskTitle: task.title,
        workspaceId: workspace.id,
      });

      expect(notification).toBeNull();

      // Verify no notification was created
      const allNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_1"));
      expect(allNotifications.length).toBe(0);
    });

    // NH04: createMentionNotification creates correct notification
    it("nh04: createMentionNotification creates correct notification", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create a comment first
      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Hey @user_2, check this out!",
        })
        .returning();

      const notification = await createMentionNotification({
        db,
        mentionedUserId: "user_2",
        mentionerId: "user_1",
        commentId: comment.id,
        taskId: task.id,
        taskTitle: task.title,
        workspaceId: workspace.id,
      });

      expect(notification).toBeDefined();
      expect(notification!.userId).toBe("user_2");
      expect(notification!.type).toBe("mention");
      expect(notification!.title).toContain("mentioned");
      expect(notification!.resourceType).toBe("comment");
      expect(notification!.resourceId).toBe(comment.id);
    });

    // NH05: createMentionNotification skips self-mention
    it("nh05: createMentionNotification skips self-mention", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create a comment first
      const [comment] = await db
        .insert(comments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          userId: "user_1",
          content: "Noting for @user_1 later",
        })
        .returning();

      const notification = await createMentionNotification({
        db,
        mentionedUserId: "user_1",
        mentionerId: "user_1",
        commentId: comment.id,
        taskId: task.id,
        taskTitle: task.title,
        workspaceId: workspace.id,
      });

      expect(notification).toBeNull();

      // Verify no notification was created
      const allNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_1"));
      expect(allNotifications.length).toBe(0);
    });
  });

  // ==================== GET /notifications (N03-N07) ====================
  describe("get /notifications", () => {
    // N03: Returns paginated notifications for authenticated user
    it("n03: returns paginated notifications for authenticated user", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create some notifications
      await db.insert(notifications).values([
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "You were assigned to task 1",
          resourceType: "task",
          resourceId: task.id,
        },
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "mention",
          title: "You were mentioned",
          resourceType: "task",
          resourceId: task.id,
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
        "/notifications",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(2);
    });

    // N04: Respects limit and offset parameters
    it("n04: respects limit and offset parameters", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create 5 notifications
      for (let i = 0; i < 5; i++) {
        await db.insert(notifications).values({
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: `Notification ${i}`,
          resourceType: "task",
          resourceId: task.id,
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
        "/notifications?limit=2&offset=2",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(2);
    });

    // N05: Returns only current user's notifications
    it("n05: returns only current user's notifications", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create notifications for different users
      await db.insert(notifications).values([
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "User 1 notification",
          resourceType: "task",
          resourceId: task.id,
        },
        {
          userId: "user_2",
          workspaceId: workspace.id,
          type: "assignment",
          title: "User 2 notification",
          resourceType: "task",
          resourceId: task.id,
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
        "/notifications",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
      expect(json[0].title).toBe("User 1 notification");
    });

    // N06: Orders by createdAt DESC (newest first)
    it("n06: orders by createdAt DESC (newest first)", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create notifications with different timestamps
      await db.insert(notifications).values([
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "First notification",
          resourceType: "task",
          resourceId: task.id,
          createdAt: new Date("2024-01-01"),
        },
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "mention",
          title: "Third notification",
          resourceType: "task",
          resourceId: task.id,
          createdAt: new Date("2024-01-03"),
        },
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Second notification",
          resourceType: "task",
          resourceId: task.id,
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
        "/notifications",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].title).toBe("Third notification");
      expect(json[1].title).toBe("Second notification");
      expect(json[2].title).toBe("First notification");
    });

    // N07: Requires authentication
    it("n07: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/notifications",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== PATCH /notifications/:id/read (N08-N11) ====================
  describe("patch /notifications/:id/read", () => {
    // N08: Marks notification as read
    it("n08: marks notification as read", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [notification] = await db
        .insert(notifications)
        .values({
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Test notification",
          resourceType: "task",
          resourceId: task.id,
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
        `/notifications/${notification.id}/read`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.isRead).toBe(true);
    });

    // N09: Cannot mark other user's notification
    it("n09: cannot mark other user's notification", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [notification] = await db
        .insert(notifications)
        .values({
          userId: "user_2",
          workspaceId: workspace.id,
          type: "assignment",
          title: "User 2 notification",
          resourceType: "task",
          resourceId: task.id,
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
        `/notifications/${notification.id}/read`,
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // N10: Returns 404 for non-existent notification
    it("n10: returns 404 for non-existent notification", async () => {
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
        "/notifications/00000000-0000-0000-0000-000000000000/read",
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // N11: Requires authentication
    it("n11: requires authentication (mark read)", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/notifications/00000000-0000-0000-0000-000000000000/read",
        { method: "PATCH" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== POST /notifications/mark-all-read (N12-N14) ====================
  describe("post /notifications/mark-all-read", () => {
    // N12: Marks all notifications as read
    it("n12: marks all notifications as read", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create multiple unread notifications
      await db.insert(notifications).values([
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Notification 1",
          resourceType: "task",
          resourceId: task.id,
        },
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "mention",
          title: "Notification 2",
          resourceType: "task",
          resourceId: task.id,
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
        "/notifications/mark-all-read",
        { method: "POST" },
        env,
      );

      expect(response.status).toBe(200);

      // Verify all are marked as read
      const unreadNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.isRead, false));
      expect(unreadNotifications.length).toBe(0);
    });

    // N13: Only marks current user's notifications
    it("n13: only marks current user's notifications", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create notifications for both users
      await db.insert(notifications).values([
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "User 1 notification",
          resourceType: "task",
          resourceId: task.id,
        },
        {
          userId: "user_2",
          workspaceId: workspace.id,
          type: "assignment",
          title: "User 2 notification",
          resourceType: "task",
          resourceId: task.id,
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      await router.request(
        "/notifications/mark-all-read",
        { method: "POST" },
        env,
      );

      // Verify user_2's notification is still unread
      const user2Notifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, "user_2"));
      expect(user2Notifications[0].isRead).toBe(false);
    });

    // N14: Requires authentication
    it("n14: requires authentication (mark all)", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/notifications/mark-all-read",
        { method: "POST" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== GET /notifications/unread-count (N15-N18) ====================
  describe("get /notifications/unread-count", () => {
    // N15: Returns correct unread count
    it("n15: returns correct unread count", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create 3 unread and 1 read notification
      await db.insert(notifications).values([
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Unread 1",
          resourceType: "task",
          resourceId: task.id,
          isRead: false,
        },
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Unread 2",
          resourceType: "task",
          resourceId: task.id,
          isRead: false,
        },
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Unread 3",
          resourceType: "task",
          resourceId: task.id,
          isRead: false,
        },
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "Read",
          resourceType: "task",
          resourceId: task.id,
          isRead: true,
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
        "/notifications/unread-count",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.count).toBe(3);
    });

    // N16: Returns 0 when no unread notifications
    it("n16: returns 0 when no unread notifications", async () => {
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
        "/notifications/unread-count",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.count).toBe(0);
    });

    // N17: Only counts current user's notifications
    it("n17: only counts current user's notifications", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create unread notifications for both users
      await db.insert(notifications).values([
        {
          userId: "user_1",
          workspaceId: workspace.id,
          type: "assignment",
          title: "User 1 notification",
          resourceType: "task",
          resourceId: task.id,
          isRead: false,
        },
        {
          userId: "user_2",
          workspaceId: workspace.id,
          type: "assignment",
          title: "User 2 notification",
          resourceType: "task",
          resourceId: task.id,
          isRead: false,
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
        "/notifications/unread-count",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.count).toBe(1);
    });

    // N18: Requires authentication
    it("n18: requires authentication (unread count)", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/notifications/unread-count",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });
});
