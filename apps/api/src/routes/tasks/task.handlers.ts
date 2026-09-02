import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, max } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { WorkspaceMemberRole } from "@/api/db/schema";
import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  boardMembers,
  boards,
  columns,
  taskAssignees,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "@/api/db/schema";
import { logActivity } from "@/api/lib/activity-logger";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";
import { createAssignmentNotification } from "@/api/lib/notifications";
import { getBoardAccess } from "@/api/lib/permissions";

import type {
  ArchiveTaskRoute,
  AssignUserRoute,
  CreateTaskRoute,
  DeleteTaskRoute,
  GetTaskRoute,
  ListOverdueTasksRoute,
  ListTasksRoute,
  MoveTaskRoute,
  ReorderTasksRoute,
  UnarchiveTaskRoute,
  UnassignUserRoute,
  UpdateTaskRoute,
} from "./task.routes";

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

export const createTask: AppRouteHandler<CreateTaskRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const body = c.req.valid("json");
  const db = createDb(c.env);

  // Get board and verify access
  const [board] = await db
    .select()
    .from(boards)
    .where(
      and(
        eq(boards.id, body.boardId),
        eq(boards.workspaceId, workspaceId),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);

  if (!board) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  const access = await getBoardAccess({
    db,
    boardId: body.boardId,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Verify column exists and belongs to the board
  const [column] = await db
    .select()
    .from(columns)
    .where(eq(columns.id, body.columnId))
    .limit(1);

  if (!column) {
    return c.json({ message: "Column not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (column.boardId !== body.boardId) {
    return c.json(
      { message: "Column does not belong to board" },
      HttpStatusCodes.BAD_REQUEST,
    );
  }

  // Get next position in column
  const [maxPosition] = await db
    .select({ maxPos: max(tasks.position) })
    .from(tasks)
    .where(
      and(
        eq(tasks.columnId, body.columnId),
        isNull(tasks.deletedAt),
      ),
    );

  const nextPosition = (maxPosition?.maxPos ?? -1) + 1;

  // Create task - workspace_id is auto-populated from board
  const [task] = await db
    .insert(tasks)
    .values({
      workspaceId: board.workspaceId,
      boardId: body.boardId,
      columnId: body.columnId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      dueDate: body.dueDate,
      position: nextPosition,
      createdById: userId,
    })
    .returning();

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "task_created",
    boardId: body.boardId,
    taskId: task.id,
    metadata: { title: task.title },
  });

  c.var.logger?.info({ taskId: task.id, userId }, "Task created");

  return c.json(task, HttpStatusCodes.CREATED);
};

export const listTasks: AppRouteHandler<ListTasksRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const query = c.req.valid("query");
  const db = createDb(c.env);

  // Verify board access
  const access = await getBoardAccess({
    db,
    boardId: query.boardId,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Build query conditions
  const conditions = [
    eq(tasks.boardId, query.boardId),
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
  ];

  // Filter by archived status
  if (query.archived) {
    conditions.push(isNotNull(tasks.archivedAt));
  }
  else {
    conditions.push(isNull(tasks.archivedAt));
  }

  // Filter by priority
  if (query.priority) {
    conditions.push(eq(tasks.priority, query.priority));
  }

  // Filter by due date
  if (query.dueBefore) {
    conditions.push(lte(tasks.dueDate, new Date(query.dueBefore)));
  }
  if (query.dueAfter) {
    conditions.push(gte(tasks.dueDate, new Date(query.dueAfter)));
  }

  let taskList;

  // Filter by assignee if specified
  if (query.assigneeId) {
    taskList = await db
      .select({ task: tasks })
      .from(tasks)
      .innerJoin(taskAssignees, eq(tasks.id, taskAssignees.taskId))
      .where(
        and(...conditions, eq(taskAssignees.userId, query.assigneeId)),
      )
      .orderBy(asc(tasks.position));

    taskList = taskList.map(r => r.task);
  }
  else {
    taskList = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(asc(tasks.position));
  }

  // Get assignees with user details for all tasks
  const taskIds = taskList.map(t => t.id);
  let assigneesWithUsers: Array<{
    taskId: string;
    id: string;
    userId: string;
    assignedAt: Date;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      imageUrl: string | null;
    };
  }> = [];

  if (taskIds.length > 0) {
    assigneesWithUsers = await db
      .select({
        taskId: taskAssignees.taskId,
        id: taskAssignees.id,
        userId: taskAssignees.userId,
        assignedAt: taskAssignees.assignedAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          imageUrl: users.imageUrl,
        },
      })
      .from(taskAssignees)
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds));
  }

  // Group assignees by task
  type AssigneeResponse = {
    id: string;
    userId: string;
    assignedAt: Date;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      imageUrl: string | null;
    };
  };
  const assigneesByTask = assigneesWithUsers.reduce((acc, a) => {
    if (!acc[a.taskId]) {
      acc[a.taskId] = [];
    }
    acc[a.taskId].push({
      id: a.id,
      userId: a.userId,
      assignedAt: a.assignedAt,
      user: a.user,
    });
    return acc;
  }, {} as Record<string, AssigneeResponse[]>);

  // Combine tasks with assignees
  const tasksWithAssignees = taskList.map(task => ({
    ...task,
    assignees: assigneesByTask[task.id] || [],
  }));

  return c.json(tasksWithAssignees, HttpStatusCodes.OK);
};

export const listOverdueTasks: AppRouteHandler<ListOverdueTasksRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const query = c.req.valid("query");
  const db = createDb(c.env);
  const now = new Date();

  // For workspace owner/admin, show all overdue tasks
  // For other roles, only show tasks from boards they are a member of
  const workspaceRole = c.get("workspaceRole");
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";

  // Get boards the user can access (for non-admin users)
  let accessibleBoardIds: string[] = [];
  if (!isWorkspaceAdmin) {
    const memberBoards = await db
      .select({ boardId: boardMembers.boardId })
      .from(boardMembers)
      .innerJoin(boards, eq(boardMembers.boardId, boards.id))
      .where(
        and(
          eq(boardMembers.userId, userId),
          eq(boards.workspaceId, workspaceId),
          isNull(boards.deletedAt),
        ),
      );

    accessibleBoardIds = memberBoards.map(b => b.boardId);

    // If user has no accessible boards, return empty list
    if (accessibleBoardIds.length === 0) {
      return c.json([], HttpStatusCodes.OK);
    }
  }

  // Build query conditions
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNotNull(tasks.dueDate),
    lt(tasks.dueDate, now),
    isNull(tasks.archivedAt),
    isNull(tasks.deletedAt),
    isNull(tasks.completedAt),
    isNull(boards.deletedAt),
  ];

  // Add board access filter for non-admin users
  if (!isWorkspaceAdmin) {
    conditions.push(inArray(tasks.boardId, accessibleBoardIds));
  }

  // Get overdue tasks across workspace (due date in the past, not archived, not deleted, not completed)
  const overdueTasks = await db
    .select({
      task: tasks,
      boardName: boards.name,
      boardColor: boards.color,
    })
    .from(tasks)
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.dueDate)) // Oldest overdue first
    .limit(query.limit);

  // Get assignees with user details
  const taskIds = overdueTasks.map(t => t.task.id);
  let assigneesWithUsers: Array<{
    taskId: string;
    id: string;
    userId: string;
    assignedAt: Date;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      imageUrl: string | null;
    };
  }> = [];

  if (taskIds.length > 0) {
    assigneesWithUsers = await db
      .select({
        taskId: taskAssignees.taskId,
        id: taskAssignees.id,
        userId: taskAssignees.userId,
        assignedAt: taskAssignees.assignedAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          imageUrl: users.imageUrl,
        },
      })
      .from(taskAssignees)
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds));
  }

  // Group assignees by task
  type AssigneeResponse = {
    id: string;
    userId: string;
    assignedAt: Date;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      imageUrl: string | null;
    };
  };
  const assigneesByTask = assigneesWithUsers.reduce((acc, a) => {
    if (!acc[a.taskId]) {
      acc[a.taskId] = [];
    }
    acc[a.taskId].push({
      id: a.id,
      userId: a.userId,
      assignedAt: a.assignedAt,
      user: a.user,
    });
    return acc;
  }, {} as Record<string, AssigneeResponse[]>);

  // Combine tasks with assignees and board info
  const result = overdueTasks.map(({ task, boardName, boardColor }) => ({
    ...task,
    boardName,
    boardColor,
    assignees: assigneesByTask[task.id] || [],
  }));

  return c.json(result, HttpStatusCodes.OK);
};

export const getTask: AppRouteHandler<GetTaskRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get assignees
  const assignees = await db
    .select({
      id: taskAssignees.id,
      userId: taskAssignees.userId,
      assignedAt: taskAssignees.assignedAt,
    })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, id));

  return c.json({ ...task, assignees }, HttpStatusCodes.OK);
};

export const updateTask: AppRouteHandler<UpdateTaskRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Build changed fields for activity metadata
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (body.title !== undefined && body.title !== task.title) {
    changes.title = { old: task.title, new: body.title };
  }
  if (body.description !== undefined && body.description !== task.description) {
    changes.description = { old: task.description, new: body.description };
  }
  if (body.priority !== undefined && body.priority !== task.priority) {
    changes.priority = { old: task.priority, new: body.priority };
  }
  if (body.dueDate !== undefined) {
    const oldDueDate = task.dueDate?.toISOString() ?? null;
    const newDueDate = body.dueDate?.toISOString() ?? null;
    if (oldDueDate !== newDueDate) {
      changes.dueDate = { old: oldDueDate, new: newDueDate };
    }
  }

  // Update task (columnId and workspaceId are not allowed)
  const [updated] = await db
    .update(tasks)
    .set({
      title: body.title,
      description: body.description,
      priority: body.priority,
      dueDate: body.dueDate,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  // Reset dueDateEmailSent when dueDate changes (D-17)
  if (changes.dueDate) {
    await db
      .update(taskAssignees)
      .set({ dueDateEmailSent: false })
      .where(eq(taskAssignees.taskId, id));
  }

  // Log activity if there were changes
  if (Object.keys(changes).length > 0) {
    await logActivity({
      db,
      workspaceId,
      userId,
      action: "task_updated",
      boardId: task.boardId,
      taskId: id,
      metadata: { changes },
    });

    // Email notification (TASK-02) — fire-and-forget for key field changes only (D-09)
    const keyFields = ["title", "description", "priority", "dueDate"];
    const keyFieldsChanged = Object.keys(changes).some(k => keyFields.includes(k));

    if (keyFieldsChanged) {
      const assignees = await db
        .select({ userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, id));

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

        const [boardForEmail] = await db
          .select({ name: boards.name })
          .from(boards)
          .where(eq(boards.id, task.boardId))
          .limit(1);
        const boardName = boardForEmail?.name ?? "Unknown board";

        const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";
        const changedFields = Object.keys(changes).filter(k => keyFields.includes(k)).join(", ");

        for (const assignee of assignees) {
          await dispatchNotificationEmail({
            db,
            env: c.env,
            type: "task_updated",
            actorId: userId,
            recipientId: assignee.userId,
            payload: {
              actorName,
              taskTitle: task.title,
              boardName,
              boardId: task.boardId,
              taskId: task.id,
              workspaceSlug,
              changedFields,
              ctaUrl: `${frontendUrl}/boards/${task.boardId}`,
              preferencesUrl: `${frontendUrl}/settings#notifications`,
            },
          }).catch(() => {});
        }
      }
    }
  }

  c.var.logger?.info({ taskId: id, userId }, "Task updated");

  return c.json(updated, HttpStatusCodes.OK);
};

export const deleteTask: AppRouteHandler<DeleteTaskRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canDeleteTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Soft delete
  await db
    .update(tasks)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "task_deleted",
    boardId: task.boardId,
    taskId: id,
    metadata: { title: task.title },
  });

  c.var.logger?.info({ taskId: id, userId }, "Task deleted");

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

export const moveTask: AppRouteHandler<MoveTaskRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Verify target column exists and belongs to same board
  const [targetColumn] = await db
    .select()
    .from(columns)
    .where(eq(columns.id, body.columnId))
    .limit(1);

  if (!targetColumn) {
    return c.json({ message: "Column not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (targetColumn.boardId !== task.boardId) {
    return c.json(
      { message: "Target column not in same board" },
      HttpStatusCodes.BAD_REQUEST,
    );
  }

  // Determine completedAt value
  let completedAt = task.completedAt;
  if (targetColumn.isDoneColumn && !task.completedAt) {
    // Moving TO Done column - set completed_at
    completedAt = new Date();
  }
  else if (!targetColumn.isDoneColumn && task.completedAt) {
    // Moving FROM Done column - clear completed_at
    completedAt = null;
  }

  // Get old column name for activity
  const [oldColumn] = await db
    .select({ name: columns.name })
    .from(columns)
    .where(eq(columns.id, task.columnId))
    .limit(1);

  // Update task
  const [updated] = await db
    .update(tasks)
    .set({
      columnId: body.columnId,
      position: body.position,
      completedAt,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "task_moved",
    boardId: task.boardId,
    taskId: id,
    metadata: {
      fromColumnId: task.columnId,
      toColumnId: body.columnId,
      fromColumnName: oldColumn?.name ?? null,
      toColumnName: targetColumn.name,
    },
  });

  // Email notification (TASK-02) — fire-and-forget for column/status change (D-09)
  const moveAssignees = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, id));

  if (moveAssignees.length > 0) {
    const [moveActor] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const moveActorName = [moveActor?.firstName, moveActor?.lastName].filter(Boolean).join(" ") || "Someone";

    const [moveWs] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const moveWorkspaceSlug = moveWs?.slug ?? workspaceId;

    const [moveBoard] = await db
      .select({ name: boards.name })
      .from(boards)
      .where(eq(boards.id, task.boardId))
      .limit(1);
    const moveBoardName = moveBoard?.name ?? "Unknown board";

    const moveFrontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

    for (const assignee of moveAssignees) {
      await dispatchNotificationEmail({
        db,
        env: c.env,
        type: "task_updated",
        actorId: userId,
        recipientId: assignee.userId,
        payload: {
          actorName: moveActorName,
          taskTitle: task.title,
          boardName: moveBoardName,
          boardId: task.boardId,
          taskId: task.id,
          workspaceSlug: moveWorkspaceSlug,
          changedFields: "status",
          ctaUrl: `${moveFrontendUrl}/${moveWorkspaceSlug}/boards/${task.boardId}/tasks/${task.id}`,
          preferencesUrl: `${moveFrontendUrl}/settings#notifications`,
        },
      }).catch(() => {});
    }
  }

  c.var.logger?.info(
    { taskId: id, userId, fromColumn: task.columnId, toColumn: body.columnId },
    "Task moved",
  );

  return c.json(updated, HttpStatusCodes.OK);
};

export const archiveTask: AppRouteHandler<ArchiveTaskRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  if (task.archivedAt) {
    return c.json(
      { message: "Task already archived" },
      HttpStatusCodes.CONFLICT,
    );
  }

  const [updated] = await db
    .update(tasks)
    .set({
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "task_archived",
    boardId: task.boardId,
    taskId: id,
    metadata: { title: task.title },
  });

  c.var.logger?.info({ taskId: id, userId }, "Task archived");

  return c.json(updated, HttpStatusCodes.OK);
};

export const unarchiveTask: AppRouteHandler<UnarchiveTaskRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  if (!task.archivedAt) {
    return c.json({ message: "Task not archived" }, HttpStatusCodes.CONFLICT);
  }

  const [updated] = await db
    .update(tasks)
    .set({
      archivedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "task_unarchived",
    boardId: task.boardId,
    taskId: id,
    metadata: { title: task.title },
  });

  c.var.logger?.info({ taskId: id, userId }, "Task unarchived");

  return c.json(updated, HttpStatusCodes.OK);
};

export const reorderTasks: AppRouteHandler<ReorderTasksRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const body = c.req.valid("json");
  const db = createDb(c.env);

  // Get the column
  const [column] = await db
    .select()
    .from(columns)
    .where(eq(columns.id, body.columnId))
    .limit(1);

  if (!column) {
    return c.json({ message: "Column not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get board for the column and verify workspace access
  const [board] = await db
    .select()
    .from(boards)
    .where(
      and(
        eq(boards.id, column.boardId),
        eq(boards.workspaceId, workspaceId),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);

  if (!board) {
    return c.json({ message: "Column not found" }, HttpStatusCodes.NOT_FOUND);
  }

  const access = await getBoardAccess({
    db,
    boardId: board.id,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Get all tasks being reordered
  const tasksToReorder = await db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.id, body.taskIds),
        isNull(tasks.deletedAt),
      ),
    );

  // Verify all tasks exist and belong to the same column
  if (tasksToReorder.length !== body.taskIds.length) {
    return c.json(
      { message: "Some tasks not found" },
      HttpStatusCodes.BAD_REQUEST,
    );
  }

  for (const task of tasksToReorder) {
    if (task.columnId !== body.columnId) {
      return c.json(
        { message: "Tasks not all in same column" },
        HttpStatusCodes.BAD_REQUEST,
      );
    }
  }

  // Update positions atomically using D1 batch
  const now = new Date();
  const updateStatements = body.taskIds.map((taskId, i) =>
    db
      .update(tasks)
      .set({ position: i, updatedAt: now })
      .where(eq(tasks.id, taskId)),
  );
  // Type assertion safe: schema validates min(1) taskIds
  await db.batch(updateStatements as [typeof updateStatements[0], ...typeof updateStatements]);

  c.var.logger?.info(
    { columnId: body.columnId, taskIds: body.taskIds, userId },
    "Tasks reordered",
  );

  return c.json({ success: true }, HttpStatusCodes.OK);
};

export const assignUser: AppRouteHandler<AssignUserRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    userId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Verify target user is a member of the same workspace
  const [targetUser] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.userId, body.userId), eq(workspaceMembers.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!targetUser) {
    return c.json(
      { message: "User not found in workspace" },
      HttpStatusCodes.NOT_FOUND,
    );
  }

  // Check if already assigned
  const [existing] = await db
    .select()
    .from(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, id), eq(taskAssignees.userId, body.userId)),
    )
    .limit(1);

  if (existing) {
    return c.json(
      { message: "User already assigned" },
      HttpStatusCodes.CONFLICT,
    );
  }

  const [assignment] = await db
    .insert(taskAssignees)
    .values({
      taskId: id,
      userId: body.userId,
    })
    .returning();

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId,
    action: "assignee_added",
    boardId: task.boardId,
    taskId: id,
    metadata: { assigneeId: body.userId },
  });

  // Create notification for assignee (skips if self-assignment)
  await createAssignmentNotification({
    db,
    assigneeId: body.userId,
    assignerId: userId,
    taskId: id,
    taskTitle: task.title,
    workspaceId,
  });

  // Email notification (TASK-01) — fire-and-forget
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

  const [boardForEmail] = await db
    .select({ name: boards.name })
    .from(boards)
    .where(eq(boards.id, task.boardId))
    .limit(1);
  const boardName = boardForEmail?.name ?? "Unknown board";

  const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

  await dispatchNotificationEmail({
    db,
    env: c.env,
    type: "task_assigned",
    actorId: userId,
    recipientId: body.userId,
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

  c.var.logger?.info(
    { taskId: id, assignedUserId: body.userId, assignedBy: userId },
    "User assigned to task",
  );

  return c.json(assignment, HttpStatusCodes.CREATED);
};

export const unassignUser: AppRouteHandler<UnassignUserRoute> = async (c) => {
  const currentUserId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id, userId: targetUserId } = c.req.valid("param");

  if (!currentUserId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const { task, access } = await getTaskWithAccess(
    db,
    id,
    currentUserId,
    workspaceId,
    c.get("workspaceRole") ?? "user",
  );

  if (!task || !access?.canView) {
    return c.json({ message: "Task not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEditTasks) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check if assignment exists
  const [existing] = await db
    .select()
    .from(taskAssignees)
    .where(
      and(
        eq(taskAssignees.taskId, id),
        eq(taskAssignees.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!existing) {
    return c.json(
      { message: "Assignment not found" },
      HttpStatusCodes.NOT_FOUND,
    );
  }

  await db
    .delete(taskAssignees)
    .where(
      and(
        eq(taskAssignees.taskId, id),
        eq(taskAssignees.userId, targetUserId),
      ),
    );

  // Log activity
  await logActivity({
    db,
    workspaceId,
    userId: currentUserId,
    action: "assignee_removed",
    boardId: task.boardId,
    taskId: id,
    metadata: { assigneeId: targetUserId },
  });

  c.var.logger?.info(
    { taskId: id, unassignedUserId: targetUserId, unassignedBy: currentUserId },
    "User unassigned from task",
  );

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};
