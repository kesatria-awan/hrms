import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "@/api/db/schema";
import type { ActivityAction, ActivityMetadata } from "@/api/db/schema";

import { activities } from "@/api/db/schema";

export type LogActivityParams = {
  db: DrizzleD1Database<typeof schema>;
  workspaceId: string;
  userId: string;
  action: ActivityAction;
  boardId?: string | null;
  taskId?: string | null;
  metadata?: ActivityMetadata | null;
};

/**
 * Log an activity record for audit trail.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  const { db, workspaceId, userId, action, boardId, taskId, metadata } = params;

  await db.insert(activities).values({
    workspaceId,
    userId,
    action,
    boardId: boardId ?? null,
    taskId: taskId ?? null,
    metadata: metadata ?? null,
  });
}
