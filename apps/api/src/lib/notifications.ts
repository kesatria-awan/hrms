import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "@/api/db/schema";
import type { Notification, NotificationType, ResourceType } from "@/api/db/schema";

import { notifications } from "@/api/db/schema";

export type CreateNotificationParams = {
  db: DrizzleD1Database<typeof schema>;
  userId: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  resourceType?: ResourceType | null;
  resourceId?: string | null;
};

/**
 * Create a notification record.
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<Notification> {
  const { db, userId, workspaceId, type, title, body, resourceType, resourceId } = params;

  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      workspaceId,
      type,
      title,
      body: body ?? null,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
    })
    .returning();

  if (!notification) {
    throw new Error(`Failed to create notification for user ${userId}`);
  }

  return notification;
}

export type CreateAssignmentNotificationParams = {
  db: DrizzleD1Database<typeof schema>;
  assigneeId: string;
  assignerId: string;
  taskId: string;
  taskTitle: string;
  workspaceId: string;
};

/**
 * Create a notification for task assignment.
 * Returns null if assigning to self (no notification needed).
 */
export async function createAssignmentNotification(
  params: CreateAssignmentNotificationParams,
): Promise<Notification | null> {
  const { db, assigneeId, assignerId, taskId, taskTitle, workspaceId } = params;

  // Skip notification if assigning to self
  if (assigneeId === assignerId) {
    return null;
  }

  return createNotification({
    db,
    userId: assigneeId,
    workspaceId,
    type: "assignment",
    title: `You were assigned to "${taskTitle}"`,
    resourceType: "task",
    resourceId: taskId,
  });
}

export type CreateMentionNotificationParams = {
  db: DrizzleD1Database<typeof schema>;
  mentionedUserId: string;
  mentionerId: string;
  commentId: string;
  taskId: string;
  taskTitle: string;
  workspaceId: string;
};

/**
 * Create a notification for @mention in a comment.
 * Returns null if mentioning self (no notification needed).
 */
export async function createMentionNotification(
  params: CreateMentionNotificationParams,
): Promise<Notification | null> {
  const { db, mentionedUserId, mentionerId, commentId, taskId: _taskId, taskTitle, workspaceId } = params;

  // Skip notification if mentioning self
  if (mentionedUserId === mentionerId) {
    return null;
  }

  return createNotification({
    db,
    userId: mentionedUserId,
    workspaceId,
    type: "mention",
    title: `You were mentioned in "${taskTitle}"`,
    resourceType: "comment",
    resourceId: commentId,
  });
}
