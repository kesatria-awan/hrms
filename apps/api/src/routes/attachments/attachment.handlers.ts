import { and, count, desc, eq, isNull, like } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { WorkspaceMemberRole } from "@/api/db/schema";
import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { attachments, boards, taskAssignees, tasks, users, workspaces } from "@/api/db/schema";
import { logActivity } from "@/api/lib/activity-logger";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";
import { getBoardAccess } from "@/api/lib/permissions";
import {
  checkStorageQuota,
  generateR2Key,
  reserveStorage,
  updateStorageUsage,
} from "@/api/lib/storage";

import type {
  DeleteAttachmentRoute,
  GetDownloadUrlRoute,
  ListAttachmentsRoute,
  ListWorkspaceAttachmentsRoute,
  RequestUploadRoute,
} from "./attachment.routes";

// Helper to get task with board access check
async function getTaskWithAccess(
  db: ReturnType<typeof createDb>,
  taskId: string,
  userId: string,
  workspaceId: string,
  userWorkspaceRole: WorkspaceMemberRole,
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);

  if (!task) {
    return { task: null, access: null };
  }

  const access = await getBoardAccess({
    db,
    boardId: task.boardId,
    userId,
    workspaceId,
    userWorkspaceRole,
  });

  return { task, access };
}

// Helper to get attachment with access check
async function getAttachmentWithAccess(
  db: ReturnType<typeof createDb>,
  attachmentId: string,
  userId: string,
  workspaceId: string,
  userWorkspaceRole: WorkspaceMemberRole,
) {
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!attachment) {
    return { attachment: null, task: null, access: null };
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, attachment.taskId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);

  if (!task) {
    return { attachment: null, task: null, access: null };
  }

  const access = await getBoardAccess({
    db,
    boardId: task.boardId,
    userId,
    workspaceId,
    userWorkspaceRole,
  });

  return { attachment, task, access };
}

export const requestUpload: AppRouteHandler<RequestUploadRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { taskId } = c.req.valid("param");
  const db = createDb(c.env);

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const fileName = formData.get("fileName") as string | null;
  const fileSizeStr = formData.get("fileSize") as string | null;
  const mimeType = formData.get("mimeType") as string | null;

  if (!file || !fileName || !fileSizeStr || !mimeType) {
    return c.json(
      { message: "Missing required fields: file, fileName, fileSize, mimeType" },
      HttpStatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  const fileSize = Number(fileSizeStr);

  // Verify task access
  const { task, access } = await getTaskWithAccess(
    db,
    taskId,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canUpload) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check storage quota
  const quotaCheck = await checkStorageQuota(db, workspaceId, fileSize);
  if (!quotaCheck.hasQuota) {
    return c.json(
      { message: "Storage quota exceeded" },
      HttpStatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  // Generate R2 key
  const r2Key = generateR2Key(workspaceId, taskId, fileName);

  // Upload file to R2 via native binding
  await c.env.R2_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: {
      contentType: mimeType,
    },
  });

  // Atomically reserve storage
  const storageReserved = await reserveStorage(db, workspaceId, fileSize);
  if (!storageReserved) {
    // Clean up uploaded file
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await c.env.R2_BUCKET.delete(r2Key);
    return c.json(
      { message: "Storage quota exceeded" },
      HttpStatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  // Create attachment record with uploaded status
  const [attachment] = await db
    .insert(attachments)
    .values({
      workspaceId,
      taskId,
      fileName,
      fileSize,
      mimeType,
      r2Key,
      status: "uploaded",
      uploadedById: userId,
    })
    .returning();

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "attachment_uploaded",
    boardId: task.boardId,
    taskId: task.id,
    metadata: {
      attachmentId: attachment.id,
      fileName,
      fileSize,
    },
  });

  // Email notification (COLLAB-03) — fire-and-forget
  const assignees = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, task.id));

  if (assignees.length > 0) {
    const [actor] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const actorName = [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || "Someone";

    const [ws] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const workspaceSlug = ws?.slug ?? workspaceId;

    const [board] = await db
      .select({ name: boards.name })
      .from(boards)
      .where(eq(boards.id, task.boardId))
      .limit(1);
    const boardName = board?.name ?? "Unknown board";

    const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

    for (const assignee of assignees) {
      await dispatchNotificationEmail({
        db,
        env: c.env,
        type: "attachment_on_task",
        actorId: userId,
        recipientId: assignee.userId,
        payload: {
          actorName,
          taskTitle: task.title,
          boardName,
          boardId: task.boardId,
          taskId: task.id,
          workspaceSlug,
          ctaUrl: `${frontendUrl}/boards/${task.boardId}`,
          preferencesUrl: `${frontendUrl}/settings#notifications`,
        },
      }).catch(() => {});
    }
  }

  c.var.logger?.info(
    { attachmentId: attachment.id, taskId, userId },
    "File uploaded",
  );

  return c.json(attachment, HttpStatusCodes.CREATED);
};

export const getDownloadUrl: AppRouteHandler<GetDownloadUrlRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { id } = c.req.valid("param");
  const db = createDb(c.env);

  // Get attachment with access check
  const { attachment, task, access } = await getAttachmentWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!attachment || attachment.deletedAt) {
    return c.json({ message: "Attachment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!task || !access?.canView) {
    return c.json({ message: "Attachment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check if attachment is ready for download
  if (attachment.status === "pending") {
    return c.json(
      { message: "Attachment not ready for download" },
      HttpStatusCodes.BAD_REQUEST,
    );
  }

  // Get file from R2 via native binding
  const r2Object = await c.env.R2_BUCKET.get(attachment.r2Key);
  if (!r2Object) {
    return c.json({ message: "Attachment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Return file with appropriate headers
  const fileBody = await r2Object.arrayBuffer();

  c.header("Content-Type", attachment.mimeType);
  c.header("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
  c.header("Content-Length", String(attachment.fileSize));

  return c.body(fileBody, HttpStatusCodes.OK);
};

export const deleteAttachment: AppRouteHandler<DeleteAttachmentRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { id } = c.req.valid("param");
  const db = createDb(c.env);

  // Get attachment with access check
  const { attachment, task, access } = await getAttachmentWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!attachment || attachment.deletedAt) {
    return c.json({ message: "Attachment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!task || !access?.canView) {
    return c.json({ message: "Attachment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check delete permission:
  // - Uploader can delete own attachment
  // - Board admin can delete any attachment
  // - Workspace admin can delete any attachment
  const isUploader = attachment.uploadedById === userId;
  const wsRole = c.get("workspaceRole");
  const isWorkspaceAdmin = wsRole === "owner" || wsRole === "admin";
  const isBoardAdmin = access.role === "admin";

  const canDelete = isUploader || isWorkspaceAdmin || isBoardAdmin;

  if (!canDelete) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Soft delete attachment
  await db
    .update(attachments)
    .set({ deletedAt: new Date(), status: "deleted" })
    .where(eq(attachments.id, id));

  // If attachment was uploaded, decrement storage usage
  if (attachment.status === "uploaded") {
    await updateStorageUsage(db, workspaceId, -attachment.fileSize);
  }

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "attachment_deleted",
    boardId: task.boardId,
    taskId: task.id,
    metadata: {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
    },
  });

  c.var.logger?.info(
    { attachmentId: id, taskId: task.id, userId },
    "Attachment deleted",
  );

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

export const listWorkspaceAttachments: AppRouteHandler<ListWorkspaceAttachmentsRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { search, page, limit } = c.req.valid("query");
  const db = createDb(c.env);
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [
    eq(attachments.workspaceId, workspaceId),
    eq(attachments.status, "uploaded"),
    isNull(attachments.deletedAt),
    isNull(tasks.deletedAt),
  ];

  if (search) {
    conditions.push(like(attachments.fileName, `%${search}%`));
  }

  const whereClause = and(...conditions);

  // Get total count
  const [{ total }] = await db
    .select({ total: count() })
    .from(attachments)
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .where(whereClause);

  // Get attachments with joins
  const attachmentList = await db
    .select({
      id: attachments.id,
      workspaceId: attachments.workspaceId,
      taskId: attachments.taskId,
      fileName: attachments.fileName,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      r2Key: attachments.r2Key,
      status: attachments.status,
      uploadedById: attachments.uploadedById,
      createdAt: attachments.createdAt,
      deletedAt: attachments.deletedAt,
      uploader: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        imageUrl: users.imageUrl,
      },
      task: {
        id: tasks.id,
        title: tasks.title,
      },
      board: {
        id: boards.id,
        name: boards.name,
        color: boards.color,
      },
    })
    .from(attachments)
    .innerJoin(users, eq(attachments.uploadedById, users.id))
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(whereClause)
    .orderBy(desc(attachments.createdAt))
    .limit(limit)
    .offset(offset);

  // Get storage stats
  const [workspace] = await db
    .select({
      usedBytes: workspaces.storageUsedBytes,
      quotaBytes: workspaces.storageQuotaBytes,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const [{ totalFiles }] = await db
    .select({ totalFiles: count() })
    .from(attachments)
    .where(
      and(
        eq(attachments.workspaceId, workspaceId),
        eq(attachments.status, "uploaded"),
        isNull(attachments.deletedAt),
      ),
    );

  return c.json(
    {
      attachments: attachmentList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      storage: {
        usedBytes: workspace?.usedBytes ?? 0,
        quotaBytes: workspace?.quotaBytes ?? 0,
        totalFiles,
      },
    },
    HttpStatusCodes.OK,
  );
};

export const listAttachments: AppRouteHandler<ListAttachmentsRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { taskId } = c.req.valid("param");
  const db = createDb(c.env);

  // Verify task access
  const { task, access } = await getTaskWithAccess(
    db,
    taskId,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get attachments with uploader info
  const attachmentList = await db
    .select({
      id: attachments.id,
      workspaceId: attachments.workspaceId,
      taskId: attachments.taskId,
      fileName: attachments.fileName,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      r2Key: attachments.r2Key,
      status: attachments.status,
      uploadedById: attachments.uploadedById,
      createdAt: attachments.createdAt,
      deletedAt: attachments.deletedAt,
      uploader: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        imageUrl: users.imageUrl,
      },
    })
    .from(attachments)
    .innerJoin(users, eq(attachments.uploadedById, users.id))
    .where(
      and(
        eq(attachments.taskId, taskId),
        eq(attachments.status, "uploaded"),
        isNull(attachments.deletedAt),
      ),
    )
    .orderBy(desc(attachments.createdAt));

  return c.json(attachmentList, HttpStatusCodes.OK);
};
