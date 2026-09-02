import { and, desc, eq, isNull } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { activities, boards, tasks, users } from "@/api/db/schema";
import { getBoardAccess } from "@/api/lib/permissions";

import type { ListActivitiesRoute, ListTaskActivitiesRoute } from "./activity.routes";

export const listActivities: AppRouteHandler<ListActivitiesRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const query = c.req.valid("query");
  const db = createDb(c.env);

  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  // Build conditions
  const conditions = [eq(activities.workspaceId, workspaceId)];

  if (query.action) {
    conditions.push(eq(activities.action, query.action));
  }

  if (query.boardId) {
    conditions.push(eq(activities.boardId, query.boardId));
  }

  // Get activities with user info
  const activityList = await db
    .select({
      id: activities.id,
      workspaceId: activities.workspaceId,
      boardId: activities.boardId,
      taskId: activities.taskId,
      userId: activities.userId,
      action: activities.action,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        imageUrl: users.imageUrl,
      },
    })
    .from(activities)
    .innerJoin(users, eq(activities.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(activities.createdAt))
    .limit(limit)
    .offset(offset);

  // Get board and task names for activities
  const boardIds = [...new Set(activityList.map(a => a.boardId).filter(Boolean))] as string[];
  const taskIds = [...new Set(activityList.map(a => a.taskId).filter(Boolean))] as string[];

  let boardNames: Record<string, string> = {};
  let taskTitles: Record<string, string> = {};

  if (boardIds.length > 0) {
    const boardList = await db
      .select({ id: boards.id, name: boards.name })
      .from(boards)
      .where(
        and(
          eq(boards.workspaceId, workspaceId),
          // Note: using SQL IN would be better but for simplicity we filter in memory
        ),
      );
    boardNames = Object.fromEntries(
      boardList
        .filter(b => boardIds.includes(b.id))
        .map(b => [b.id, b.name]),
    );
  }

  if (taskIds.length > 0) {
    const taskList = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId));
    taskTitles = Object.fromEntries(
      taskList
        .filter(t => taskIds.includes(t.id))
        .map(t => [t.id, t.title]),
    );
  }

  // Combine activities with names
  const activitiesWithNames = activityList.map(activity => ({
    ...activity,
    boardName: activity.boardId ? (boardNames[activity.boardId] ?? null) : null,
    taskTitle: activity.taskId ? (taskTitles[activity.taskId] ?? null) : null,
  }));

  return c.json(activitiesWithNames, HttpStatusCodes.OK);
};

export const listTaskActivities: AppRouteHandler<ListTaskActivitiesRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { taskId } = c.req.valid("param");
  const db = createDb(c.env);

  // Verify task exists and get board access
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
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check board access
  const access = await getBoardAccess({
    db,
    boardId: task.boardId,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get task activities with user info
  const activityList = await db
    .select({
      id: activities.id,
      workspaceId: activities.workspaceId,
      boardId: activities.boardId,
      taskId: activities.taskId,
      userId: activities.userId,
      action: activities.action,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        imageUrl: users.imageUrl,
      },
    })
    .from(activities)
    .innerJoin(users, eq(activities.userId, users.id))
    .where(eq(activities.taskId, taskId))
    .orderBy(desc(activities.createdAt));

  // Get board name
  const [board] = await db
    .select({ name: boards.name })
    .from(boards)
    .where(eq(boards.id, task.boardId))
    .limit(1);

  // Combine activities with names
  const activitiesWithNames = activityList.map(activity => ({
    ...activity,
    boardName: board?.name ?? null,
    taskTitle: task.title,
  }));

  return c.json(activitiesWithNames, HttpStatusCodes.OK);
};
