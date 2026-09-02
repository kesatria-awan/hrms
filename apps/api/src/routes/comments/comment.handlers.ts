import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { WorkspaceMemberRole } from "@/api/db/schema";
import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { boards, comments, mentions, taskAssignees, tasks, users, workspaces } from "@/api/db/schema";
import { logActivity } from "@/api/lib/activity-logger";
import { parseMentions } from "@/api/lib/mentions";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";
import { createMentionNotification } from "@/api/lib/notifications";
import { getBoardAccess } from "@/api/lib/permissions";

import type {
  CreateCommentRoute,
  DeleteCommentRoute,
  ListCommentsRoute,
  UpdateCommentRoute,
} from "./comment.routes";

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

// Helper to create/update mentions for a comment
async function syncMentions(
  db: ReturnType<typeof createDb>,
  commentId: string,
  content: string,
  workspaceId: string,
) {
  // Parse mentioned user IDs from content
  const mentionedUserIds = parseMentions(content);

  if (mentionedUserIds.length === 0) {
    // Delete all existing mentions
    await db.delete(mentions).where(eq(mentions.commentId, commentId));
    return;
  }

  // Verify mentioned users exist in the workspace
  const validUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.id, mentionedUserIds),
        eq(users.workspaceId, workspaceId),
      ),
    );

  const validUserIds = new Set(validUsers.map(u => u.id));

  // Delete existing mentions
  await db.delete(mentions).where(eq(mentions.commentId, commentId));

  // Create new mentions for valid users
  const mentionsToCreate = mentionedUserIds
    .filter(id => validUserIds.has(id))
    .map(userId => ({
      commentId,
      userId,
    }));

  if (mentionsToCreate.length > 0) {
    await db.insert(mentions).values(mentionsToCreate);
  }
}

export const createComment: AppRouteHandler<CreateCommentRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { taskId } = c.req.valid("param");
  const body = c.req.valid("json");
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

  if (!access.canComment) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Create comment
  const [comment] = await db
    .insert(comments)
    .values({
      workspaceId,
      taskId,
      userId,
      content: body.content,
    })
    .returning();

  // Create mentions
  await syncMentions(db, comment.id, body.content, workspaceId);

  // Create notifications for mentioned users
  const mentionedUserIds = parseMentions(body.content);

  // Verify mentioned users exist in the workspace before creating notifications
  const validUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.id, mentionedUserIds.length > 0 ? mentionedUserIds : [""]),
        eq(users.workspaceId, workspaceId),
      ),
    );

  const validUserIds = new Set(validUsers.map(u => u.id));

  for (const mentionedUserId of mentionedUserIds) {
    if (validUserIds.has(mentionedUserId)) {
      await createMentionNotification({
        db,
        mentionedUserId,
        mentionerId: userId,
        commentId: comment.id,
        taskId,
        taskTitle: task.title,
        workspaceId,
      });
    }
  }

  // Gather shared email context
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
  const commentPreview = body.content?.substring(0, 100) ?? "";

  // COLLAB-01: Mention emails — fire-and-forget
  const mentionedUserIdSet = new Set(
    mentionedUserIds.filter(id => validUserIds.has(id)),
  );

  for (const mentionedUserId of mentionedUserIdSet) {
    await dispatchNotificationEmail({
      db,
      env: c.env,
      type: "mention",
      actorId: userId,
      recipientId: mentionedUserId,
      payload: {
        actorName,
        taskTitle: task.title,
        boardName,
        boardId: task.boardId,
        taskId: task.id,
        workspaceSlug,
        commentPreview,
        ctaUrl: `${frontendUrl}/boards/${task.boardId}`,
        preferencesUrl: `${frontendUrl}/settings#notifications`,
      },
    }).catch(() => {});
  }

  // COLLAB-02: Comment-on-task emails to assignees (excluding commenter and already-mentioned users)
  const assignees = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, task.id));

  for (const assignee of assignees) {
    // Skip commenter (INFRA-02) and already-mentioned users (dedup)
    if (assignee.userId === userId || mentionedUserIdSet.has(assignee.userId))
      continue;

    await dispatchNotificationEmail({
      db,
      env: c.env,
      type: "comment_on_task",
      actorId: userId,
      recipientId: assignee.userId,
      payload: {
        actorName,
        taskTitle: task.title,
        boardName,
        boardId: task.boardId,
        taskId: task.id,
        workspaceSlug,
        commentPreview,
        ctaUrl: `${frontendUrl}/boards/${task.boardId}`,
        preferencesUrl: `${frontendUrl}/settings#notifications`,
      },
    }).catch(() => {});
  }

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "comment_added",
    boardId: task.boardId,
    taskId,
    metadata: { commentId: comment.id },
  });

  c.var.logger?.info({ commentId: comment.id, taskId, userId }, "Comment created");

  return c.json(comment, HttpStatusCodes.CREATED);
};

export const listComments: AppRouteHandler<ListCommentsRoute> = async (c) => {
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

  // Get comments with user info
  const commentList = await db
    .select({
      id: comments.id,
      workspaceId: comments.workspaceId,
      taskId: comments.taskId,
      userId: comments.userId,
      content: comments.content,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      deletedAt: comments.deletedAt,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        imageUrl: users.imageUrl,
      },
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(
      and(
        eq(comments.taskId, taskId),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(desc(comments.createdAt));

  // Get mentions for all comments
  const commentIds = commentList.map(c => c.id);
  let mentionsWithUsers: Array<{
    id: string;
    commentId: string;
    userId: string;
    createdAt: Date;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      imageUrl: string | null;
    };
  }> = [];

  if (commentIds.length > 0) {
    mentionsWithUsers = await db
      .select({
        id: mentions.id,
        commentId: mentions.commentId,
        userId: mentions.userId,
        createdAt: mentions.createdAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          imageUrl: users.imageUrl,
        },
      })
      .from(mentions)
      .innerJoin(users, eq(mentions.userId, users.id))
      .where(inArray(mentions.commentId, commentIds));
  }

  // Group mentions by comment
  type MentionResponse = {
    id: string;
    userId: string;
    createdAt: Date;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      imageUrl: string | null;
    };
  };
  const mentionsByComment = mentionsWithUsers.reduce((acc, m) => {
    if (!acc[m.commentId]) {
      acc[m.commentId] = [];
    }
    acc[m.commentId].push({
      id: m.id,
      userId: m.userId,
      createdAt: m.createdAt,
      user: m.user,
    });
    return acc;
  }, {} as Record<string, MentionResponse[]>);

  // Combine comments with mentions
  const commentsWithMentions = commentList.map(comment => ({
    ...comment,
    mentions: mentionsByComment[comment.id] || [],
  }));

  return c.json(commentsWithMentions, HttpStatusCodes.OK);
};

export const updateComment: AppRouteHandler<UpdateCommentRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const db = createDb(c.env);

  // Get comment
  const [comment] = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, id),
        eq(comments.workspaceId, workspaceId),
        isNull(comments.deletedAt),
      ),
    )
    .limit(1);

  if (!comment) {
    return c.json({ message: "Comment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Only author can update
  if (comment.userId !== userId) {
    return c.json({ message: "Not comment author" }, HttpStatusCodes.FORBIDDEN);
  }

  // Update comment
  const [updated] = await db
    .update(comments)
    .set({
      content: body.content,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, id))
    .returning();

  // Update mentions
  await syncMentions(db, id, body.content, workspaceId);

  c.var.logger?.info({ commentId: id, userId }, "Comment updated");

  return c.json(updated, HttpStatusCodes.OK);
};

export const deleteComment: AppRouteHandler<DeleteCommentRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { id } = c.req.valid("param");
  const db = createDb(c.env);

  // Get comment with task info
  const [comment] = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, id),
        eq(comments.workspaceId, workspaceId),
        isNull(comments.deletedAt),
      ),
    )
    .limit(1);

  if (!comment) {
    return c.json({ message: "Comment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get task for board access check
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, comment.taskId))
    .limit(1);

  if (!task) {
    return c.json({ message: "Comment not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check delete permission:
  // - Author can delete own comment
  // - Board admin can delete any comment
  // - Workspace owner/admin can delete any comment
  const isAuthor = comment.userId === userId;
  const workspaceRole = c.get("workspaceRole");
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";

  let canDelete = isAuthor || isWorkspaceAdmin;

  if (!canDelete) {
    // Check if user is board admin
    const access = await getBoardAccess({
      db,
      boardId: task.boardId,
      userId,
      workspaceId,
      userWorkspaceRole: c.get("workspaceRole") ?? "user",
    });
    canDelete = access.role === "admin";
  }

  if (!canDelete) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Soft delete
  await db
    .update(comments)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(comments.id, id));

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "comment_deleted",
    boardId: task.boardId,
    taskId: task.id,
    metadata: { commentId: id },
  });

  c.var.logger?.info({ commentId: id, userId }, "Comment deleted");

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};
