import { applyD1Migrations, env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  activities,
  attachments,
  boardMembers,
  boards,
  columns,
  tasks,
  users,
  workspaces,
} from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./attachment.handlers";
import * as routes from "./attachment.routes";

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
    .openapi(routes.requestUpload, handlers.requestUpload)
    .openapi(routes.listAttachments, handlers.listAttachments)
    .openapi(routes.listWorkspaceAttachments, handlers.listWorkspaceAttachments)
    .openapi(routes.getDownloadUrl, handlers.getDownloadUrl)
    .openapi(routes.deleteAttachment, handlers.deleteAttachment);
}

// Helper to create multipart form data for upload
function createUploadFormData(options: {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileContent?: ArrayBuffer;
}): FormData {
  const {
    fileName = "test-file.pdf",
    fileSize,
    mimeType = "application/pdf",
    fileContent,
  } = options;

  const content = fileContent ?? new ArrayBuffer(fileSize ?? 1024);
  const file = new File([content], fileName, { type: mimeType });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", fileName);
  formData.append("fileSize", String(fileSize ?? content.byteLength));
  formData.append("mimeType", mimeType);

  return formData;
}

// Helper to create a request with multipart form data
function createUploadRequest(taskId: string, formData: FormData): Request {
  return new Request(`http://localhost/tasks/${taskId}/attachments`, {
    method: "POST",
    body: formData,
  });
}

// Helper to create test data
async function setupTestData(db: ReturnType<typeof createDb>) {
  // Create workspace with storage quota
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_1",
      storageUsedBytes: 0,
      storageQuotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
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

describe("attachment routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // Clean up in correct order (respecting foreign keys)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(activities);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(attachments);
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

  // ==================== POST /tasks/:taskId/attachments (A01-A15) ====================
  describe("post /tasks/:taskId/attachments - upload file", () => {
    // A01: Creates attachment record with status uploaded
    it("a01: creates attachment record with status uploaded", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({
        fileName: "test-file.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      });

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.status).toBe("uploaded");
      expect(json.taskId).toBe(task.id);
      expect(json.workspaceId).toBe(workspace.id);
    });

    // A02: Uploads file to R2 and reserves storage
    it("a02: uploads file to R2 and reserves storage", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({
        fileName: "test-file.pdf",
        fileSize: 2048,
        mimeType: "application/pdf",
      });

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      // Verify file exists in R2
      const r2Object = await typedEnv.R2_BUCKET.head(json.r2Key);
      expect(r2Object).not.toBeNull();

      // Check storage was reserved
      const [updatedWorkspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id));
      expect(updatedWorkspace.storageUsedBytes).toBe(2048);
    });

    // A03: Returns attachment metadata (id, fileName, fileSize)
    it("a03: returns attachment metadata", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({
        fileName: "test-document.pdf",
        fileSize: 2048,
        mimeType: "application/pdf",
      });

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.id).toBeDefined();
      expect(json.fileName).toBe("test-document.pdf");
      expect(json.fileSize).toBe(2048);
      expect(json.mimeType).toBe("application/pdf");
    });

    // A04: Enforces storage quota (rejects if exceeded)
    it("a04: enforces storage quota", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Set workspace storage to near limit
      await db
        .update(workspaces)
        .set({
          storageUsedBytes: 10 * 1024 * 1024 * 1024 - 100, // 10GB - 100 bytes
        })
        .where(eq(workspaces.id, workspace.id));

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({
        fileName: "large-file.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      });

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.message).toBe("Storage quota exceeded");
    });

    // A05: Board owner can upload
    it("a05: board owner can upload", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(201);
    });

    // A06: Board editor can upload
    it("a06: board editor can upload", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      // Add user_2 as editor
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
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(201);
    });

    // A07: Board viewer can upload
    it("a07: board viewer can upload", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

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
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(201);
    });

    // A08: Rejects if task not found
    it("a08: rejects if task not found", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest("00000000-0000-0000-0000-000000000000", formData),
        undefined,
        env,
      );

      expect(response.status).toBe(404);
    });

    // A09: Rejects if task is soft-deleted
    it("a09: rejects if task is soft-deleted", async () => {
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
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(404);
    });

    // A10: Rejects if no board access (private board)
    it("a10: rejects if no board access (private board)", async () => {
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
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest(privateTask.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(404);
    });

    // A11: SECURITY - Cross-workspace access denied
    it("a11: cross-workspace access denied", async () => {
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
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest(otherTask.id, formData),
        undefined,
        env,
      );

      expect(response.status).toBe(404);
    });

    // A12: Requires authentication
    it("a12: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({});

      const response = await router.request(
        createUploadRequest("00000000-0000-0000-0000-000000000000", formData),
        undefined,
        env,
      );

      expect(response.status).toBe(401);
    });

    // A13: Creates activity record for attachment_uploaded
    it("a13: creates activity record for attachment_uploaded", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const formData = createUploadFormData({
        fileName: "test.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      });

      await router.request(
        createUploadRequest(task.id, formData),
        undefined,
        env,
      );

      // Verify activity record
      const [activity] = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.taskId, task.id),
            eq(activities.action, "attachment_uploaded"),
          ),
        );

      expect(activity).toBeDefined();
      expect(activity.userId).toBe("user_1");
      expect(activity.boardId).toBe(board.id);
    });
  });

  // ==================== GET /attachments/:id/download (A29-A39) ====================
  describe("get /attachments/:id/download - download file", () => {
    // A29: Streams file for uploaded attachment
    it("a29: streams file for uploaded attachment", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const fileContent = new ArrayBuffer(1024);
      const r2Key = `${workspace.id}/${task.id}/test-key.pdf`;

      // Put file in R2
      await typedEnv.R2_BUCKET.put(r2Key, fileContent);

      // Create an uploaded attachment
      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(response.headers.get("Content-Disposition")).toContain("test.pdf");
      expect(response.headers.get("Content-Length")).toBe("1024");

      const body = await response.arrayBuffer();
      expect(body.byteLength).toBe(1024);
    });

    // A31-A33: Board owner/editor/viewer can download
    it("a31: board owner can download", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const r2Key = `${workspace.id}/${task.id}/test-key.pdf`;
      await typedEnv.R2_BUCKET.put(r2Key, new ArrayBuffer(1024));

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
    });

    it("a32: board editor can download", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const r2Key = `${workspace.id}/${task.id}/test-key.pdf`;
      await typedEnv.R2_BUCKET.put(r2Key, new ArrayBuffer(1024));

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
    });

    it("a33: board viewer can download", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const r2Key = `${workspace.id}/${task.id}/test-key.pdf`;
      await typedEnv.R2_BUCKET.put(r2Key, new ArrayBuffer(1024));

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
    });

    // A34: Rejects if attachment not found
    it("a34: rejects if attachment not found", async () => {
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
        "/attachments/00000000-0000-0000-0000-000000000000/download",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A35: Rejects if attachment status is pending
    it("a35: rejects if attachment status is pending", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "pending",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(400);
    });

    // A36: Rejects if attachment is soft-deleted
    it("a36: rejects if attachment is soft-deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A37: Rejects if no board access (private board)
    it("a37: rejects if no board access (private board)", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { privateTask } = await setupPrivateBoard(db, workspace.id);

      const r2Key = `${workspace.id}/${privateTask.id}/test-key.pdf`;
      await typedEnv.R2_BUCKET.put(r2Key, new ArrayBuffer(1024));

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: privateTask.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key,
          status: "uploaded",
          uploadedById: "user_1",
        })
        .returning();

      // user_2 is not a member of the private board
      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A38: SECURITY - Cross-workspace access denied
    it("a38: cross-workspace access denied", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, otherTask } = await setupSecondWorkspace(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace2.id,
          taskId: otherTask.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace2.id}/${otherTask.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_other",
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
        `/attachments/${attachment.id}/download`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A39: Requires authentication
    it("a39: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/attachments/00000000-0000-0000-0000-000000000000/download",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== DELETE /attachments/:id (A40-A52) ====================
  describe("delete /attachments/:id - delete attachment", () => {
    // A40: Uploader can delete own attachment
    it("a40: uploader can delete own attachment", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_2",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // A41: Soft deletes (sets deletedAt)
    it("a41: soft deletes (sets deletedAt)", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);

      // Verify soft delete
      const [deleted] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachment.id));

      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.status).toBe("deleted");
    });

    // A42: Decrements workspace.storageUsedBytes
    it("a42: decrements workspace.storageUsedBytes", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const initialUsed = 5000;
      await db
        .update(workspaces)
        .set({ storageUsedBytes: initialUsed })
        .where(eq(workspaces.id, workspace.id));

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      await router.request(
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      // Check storage was decremented
      const [updatedWorkspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id));

      expect(updatedWorkspace.storageUsedBytes).toBe(initialUsed - 1024);
    });

    // A43: Creates activity record for attachment_deleted
    it("a43: creates activity record for attachment_deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        })
        .returning();

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      await router.request(
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      // Verify activity record
      const [activity] = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.taskId, task.id),
            eq(activities.action, "attachment_deleted"),
          ),
        );

      expect(activity).toBeDefined();
      expect(activity.userId).toBe("user_1");
      expect(activity.boardId).toBe(board.id);
    });

    // A44: Board owner can delete any attachment
    it("a44: board owner can delete any attachment", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      // Attachment uploaded by user_2
      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_2",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // A45: Board editor cannot delete others' attachments
    it("a45: board editor cannot delete others attachments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      // Attachment uploaded by user_1
      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        })
        .returning();

      // user_2 is editor, not owner
      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(403);
    });

    // A46: Board viewer cannot delete others' attachments
    it("a46: board viewer cannot delete others attachments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task, board } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      // Attachment uploaded by user_1
      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(403);
    });

    // A47: Workspace admin can delete any attachment
    it("a47: workspace admin can delete any attachment", async () => {
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

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: newTask.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${newTask.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_2",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });

    // A48: Rejects if attachment not found
    it("a48: rejects if attachment not found", async () => {
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
        "/attachments/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A49: Rejects if attachment already deleted
    it("a49: rejects if attachment already deleted", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "deleted",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A50: SECURITY - Cross-workspace access denied
    it("a50: cross-workspace access denied", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, otherTask } = await setupSecondWorkspace(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace2.id,
          taskId: otherTask.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace2.id}/${otherTask.id}/test-key.pdf`,
          status: "uploaded",
          uploadedById: "user_other",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A51: Requires authentication
    it("a51: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/attachments/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(401);
    });

    // A52: Pending attachment can be deleted (cleanup)
    it("a52: pending attachment can be deleted (cleanup)", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      const [attachment] = await db
        .insert(attachments)
        .values({
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/test-key.pdf`,
          status: "pending",
          uploadedById: "user_1",
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
        `/attachments/${attachment.id}`,
        { method: "DELETE" },
        env,
      );

      expect(response.status).toBe(204);
    });
  });

  // ==================== GET /tasks/:taskId/attachments (A53-A60) ====================
  describe("get /tasks/:taskId/attachments - list attachments", () => {
    // A53: Returns attachments ordered by createdAt DESC
    it("a53: returns attachments ordered by createdAt DESC", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create attachments with different timestamps
      await db.insert(attachments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "first.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/first.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
          createdAt: new Date("2024-01-01"),
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "second.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/second.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
          createdAt: new Date("2024-01-02"),
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "third.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/third.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
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
        `/tasks/${task.id}/attachments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(3);
      expect(json[0].fileName).toBe("third.pdf");
      expect(json[1].fileName).toBe("second.pdf");
      expect(json[2].fileName).toBe("first.pdf");
    });

    // A54: Includes uploader info (firstName, lastName, imageUrl)
    it("a54: includes uploader info", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(attachments).values({
        workspaceId: workspace.id,
        taskId: task.id,
        fileName: "test.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        r2Key: `${workspace.id}/${task.id}/test.pdf`,
        status: "uploaded",
        uploadedById: "user_1",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/attachments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json[0].uploader).toBeDefined();
      expect(json[0].uploader.firstName).toBe("John");
      expect(json[0].uploader.lastName).toBe("Doe");
      expect(json[0].uploader.imageUrl).toBe("https://example.com/user1.jpg");
    });

    // A55: Excludes soft-deleted attachments
    it("a55: excludes soft-deleted attachments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(attachments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "visible.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/visible.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "deleted.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/deleted.pdf`,
          status: "deleted",
          uploadedById: "user_1",
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
        `/tasks/${task.id}/attachments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
      expect(json[0].fileName).toBe("visible.pdf");
    });

    // A56: Excludes pending attachments
    it("a56: excludes pending attachments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(attachments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "uploaded.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/uploaded.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "pending.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/pending.pdf`,
          status: "pending",
          uploadedById: "user_1",
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
        `/tasks/${task.id}/attachments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBe(1);
      expect(json[0].fileName).toBe("uploaded.pdf");
    });

    // A57: Board viewer can list attachments
    it("a57: board viewer can list attachments", async () => {
      const db = createDb(typedEnv);
      const { workspace, board, task } = await setupTestData(db);

      await db.insert(boardMembers).values({
        boardId: board.id,
        userId: "user_2",
        role: "member",
      });

      await db.insert(attachments).values({
        workspaceId: workspace.id,
        taskId: task.id,
        fileName: "test.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        r2Key: `${workspace.id}/${task.id}/test.pdf`,
        status: "uploaded",
        uploadedById: "user_1",
      });

      const mockAuth = {
        userId: "user_2",
        userEmail: "user2@example.com",
        userRole: "member" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        `/tasks/${task.id}/attachments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
    });

    // A58: Rejects if task not found
    it("a58: rejects if task not found", async () => {
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
        "/tasks/00000000-0000-0000-0000-000000000000/attachments",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A59: SECURITY - Cross-workspace access denied
    it("a59: cross-workspace access denied", async () => {
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
        `/tasks/${otherTask.id}/attachments`,
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(404);
    });

    // A60: Requires authentication
    it("a60: requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);

      const response = await router.request(
        "/tasks/00000000-0000-0000-0000-000000000000/attachments",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(401);
    });
  });

  // ==================== GET /attachments (workspace-level list) ====================
  describe("get /attachments - list workspace attachments", () => {
    it("returns attachments with uploader/task/board info", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(attachments).values({
        workspaceId: workspace.id,
        taskId: task.id,
        fileName: "test.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        r2Key: `${workspace.id}/${task.id}/test.pdf`,
        status: "uploaded",
        uploadedById: "user_1",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const response = await router.request("/attachments", { method: "GET" }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as Record<string, unknown>;
      const items = json.attachments as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].fileName).toBe("test.pdf");

      const uploader = items[0].uploader as Record<string, unknown>;
      expect(uploader.firstName).toBe("John");
      expect(uploader.lastName).toBe("Doe");

      const taskInfo = items[0].task as Record<string, unknown>;
      expect(taskInfo.title).toBe("Test Task");

      const boardInfo = items[0].board as Record<string, unknown>;
      expect(boardInfo.name).toBe("Test Board");
      expect(boardInfo.color).toBe("#3B82F6");
    });

    it("search filtering works", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(attachments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "report.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/report.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "photo.png",
          fileSize: 2048,
          mimeType: "image/png",
          r2Key: `${workspace.id}/${task.id}/photo.png`,
          status: "uploaded",
          uploadedById: "user_1",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const response = await router.request("/attachments?search=report", { method: "GET" }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as Record<string, unknown>;
      const items = json.attachments as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].fileName).toBe("report.pdf");
    });

    it("pagination works", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      // Create 3 attachments
      await db.insert(attachments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "file1.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/file1.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
          createdAt: new Date("2024-01-01"),
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "file2.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/file2.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
          createdAt: new Date("2024-01-02"),
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "file3.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/file3.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
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
      const response = await router.request("/attachments?page=1&limit=2", { method: "GET" }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as Record<string, unknown>;
      const items = json.attachments as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);

      const pagination = json.pagination as Record<string, number>;
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(2);
      expect(pagination.total).toBe(3);
      expect(pagination.totalPages).toBe(2);
    });

    it("returns storage stats", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db
        .update(workspaces)
        .set({ storageUsedBytes: 5000 })
        .where(eq(workspaces.id, workspace.id));

      await db.insert(attachments).values({
        workspaceId: workspace.id,
        taskId: task.id,
        fileName: "test.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        r2Key: `${workspace.id}/${task.id}/test.pdf`,
        status: "uploaded",
        uploadedById: "user_1",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const response = await router.request("/attachments", { method: "GET" }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as Record<string, unknown>;
      const storage = json.storage as Record<string, number>;
      expect(storage.usedBytes).toBe(5000);
      expect(storage.quotaBytes).toBe(10 * 1024 * 1024 * 1024);
      expect(storage.totalFiles).toBe(1);
    });

    it("excludes deleted attachments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(attachments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "active.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/active.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "deleted.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/deleted.pdf`,
          status: "deleted",
          uploadedById: "user_1",
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
      const response = await router.request("/attachments", { method: "GET" }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as Record<string, unknown>;
      const items = json.attachments as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].fileName).toBe("active.pdf");
    });

    it("excludes pending attachments", async () => {
      const db = createDb(typedEnv);
      const { workspace, task } = await setupTestData(db);

      await db.insert(attachments).values([
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "uploaded.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/uploaded.pdf`,
          status: "uploaded",
          uploadedById: "user_1",
        },
        {
          workspaceId: workspace.id,
          taskId: task.id,
          fileName: "pending.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          r2Key: `${workspace.id}/${task.id}/pending.pdf`,
          status: "pending",
          uploadedById: "user_1",
        },
      ]);

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const response = await router.request("/attachments", { method: "GET" }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as Record<string, unknown>;
      const items = json.attachments as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].fileName).toBe("uploaded.pdf");
    });

    it("requires authentication", async () => {
      const mockAuth = {
        userId: "",
        userEmail: "",
        userRole: "member" as const,
        workspaceId: null,
      };

      const router = createTestRouter(mockAuth);
      const response = await router.request("/attachments", { method: "GET" }, env);

      expect(response.status).toBe(401);
    });

    it("cross-workspace isolation", async () => {
      const db = createDb(typedEnv);
      const { workspace } = await setupTestData(db);
      const { workspace2, otherTask } = await setupSecondWorkspace(db);

      // Create attachment in other workspace
      await db.insert(attachments).values({
        workspaceId: workspace2.id,
        taskId: otherTask.id,
        fileName: "other-workspace.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        r2Key: `${workspace2.id}/${otherTask.id}/other.pdf`,
        status: "uploaded",
        uploadedById: "user_other",
      });

      const mockAuth = {
        userId: "user_1",
        userEmail: "user1@example.com",
        userRole: "workspace_admin" as const,
        workspaceId: workspace.id,
      };

      const router = createTestRouter(mockAuth);
      const response = await router.request("/attachments", { method: "GET" }, env);

      expect(response.status).toBe(200);
      const json = await response.json() as Record<string, unknown>;
      const items = json.attachments as Array<Record<string, unknown>>;
      expect(items).toHaveLength(0);
    });
  });
});
