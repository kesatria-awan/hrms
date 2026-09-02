import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import {
  insertTaskSchema,
  moveTaskSchema,
  reorderTasksSchema,
  selectTaskSchema,
  taskPriorities,
  updateTaskSchema,
} from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Tasks"];

// Task response with assignees (simple, without user details)
const taskWithAssigneesSchema = selectTaskSchema.extend({
  assignees: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      assignedAt: z.date(),
    }),
  ),
});

// Task response with assignees including user details (for list endpoint)
const taskWithAssigneesAndUserSchema = selectTaskSchema.extend({
  assignees: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      assignedAt: z.date(),
      user: z.object({
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        email: z.string(),
        imageUrl: z.string().nullable(),
      }),
    }),
  ),
});

// Task response with board info (for overdue tasks dashboard)
const taskWithBoardSchema = taskWithAssigneesAndUserSchema.extend({
  boardName: z.string(),
  boardColor: z.string(),
});

// Create task
export const createTask = createRoute({
  method: "post",
  path: "/tasks",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Create task",
  description: "Create a new task in a column",
  request: {
    body: jsonContentRequired(
      insertTaskSchema.pick({
        boardId: true,
        columnId: true,
        title: true,
        description: true,
        priority: true,
        dueDate: true,
      }),
      "Task data",
    ),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(selectTaskSchema, "Created task"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Column does not belong to board"),
      "Bad request",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Board or column not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// List tasks
export const listTasks = createRoute({
  method: "get",
  path: "/tasks",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List tasks",
  description: "List tasks with optional filters",
  request: {
    query: z.object({
      boardId: z.string().uuid(),
      assigneeId: z.string().optional(),
      priority: z.enum(taskPriorities).optional(),
      dueBefore: z.string().datetime().optional(),
      dueAfter: z.string().datetime().optional(),
      archived: z
        .string()
        .transform(v => v === "true")
        .optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(taskWithAssigneesAndUserSchema),
      "List of tasks with assignees",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Board not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// List overdue tasks across workspace
export const listOverdueTasks = createRoute({
  method: "get",
  path: "/tasks/overdue",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List overdue tasks",
  description: "List all overdue tasks across all boards in the workspace",
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(taskWithBoardSchema),
      "List of overdue tasks with board info",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Get single task
export const getTask = createRoute({
  method: "get",
  path: "/tasks/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Get task",
  description: "Get a task by ID with assignees",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(taskWithAssigneesSchema, "Task details"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Update task
export const updateTask = createRoute({
  method: "patch",
  path: "/tasks/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update task",
  description: "Update task properties (use /move to change column)",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContentRequired(updateTaskSchema, "Task update data"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectTaskSchema, "Updated task"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Delete task (soft delete)
export const deleteTask = createRoute({
  method: "delete",
  path: "/tasks/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Delete task",
  description: "Soft delete a task",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Task deleted",
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Move task to different column
export const moveTask = createRoute({
  method: "patch",
  path: "/tasks/{id}/move",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Move task",
  description: "Move task to a different column (sets/clears completed_at for Done columns)",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContentRequired(moveTaskSchema, "Move data"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectTaskSchema, "Moved task"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Target column not in same board"),
      "Bad request",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task or column not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Archive task
export const archiveTask = createRoute({
  method: "patch",
  path: "/tasks/{id}/archive",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Archive task",
  description: "Archive a task",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectTaskSchema, "Archived task"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("Task already archived"),
      "Already archived",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Unarchive task
export const unarchiveTask = createRoute({
  method: "patch",
  path: "/tasks/{id}/unarchive",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Unarchive task",
  description: "Unarchive a task",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectTaskSchema, "Unarchived task"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("Task not archived"),
      "Not archived",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Reorder tasks in a column
export const reorderTasks = createRoute({
  method: "patch",
  path: "/tasks/reorder",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Reorder tasks",
  description: "Reorder tasks within a column",
  request: {
    body: jsonContentRequired(reorderTasksSchema, "Reorder data"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ success: z.boolean() }),
      "Tasks reordered",
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Tasks not all in same column"),
      "Bad request",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Column not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Assign user to task
export const assignUser = createRoute({
  method: "post",
  path: "/tasks/{id}/assignees",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Assign user",
  description: "Assign a user to a task",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContentRequired(
      z.object({
        userId: z.string().min(1),
      }),
      "Assignment data",
    ),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({
        id: z.string(),
        taskId: z.string(),
        userId: z.string(),
        assignedAt: z.date(),
      }),
      "Assignment created",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task or user not found"),
      "Not found",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("User already assigned"),
      "Already assigned",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Unassign user from task
export const unassignUser = createRoute({
  method: "delete",
  path: "/tasks/{id}/assignees/{userId}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Unassign user",
  description: "Remove a user from a task",
  request: {
    params: z.object({
      id: z.string().uuid(),
      userId: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "User unassigned",
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task or assignment not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export type CreateTaskRoute = typeof createTask;
export type ListTasksRoute = typeof listTasks;
export type ListOverdueTasksRoute = typeof listOverdueTasks;
export type GetTaskRoute = typeof getTask;
export type UpdateTaskRoute = typeof updateTask;
export type DeleteTaskRoute = typeof deleteTask;
export type MoveTaskRoute = typeof moveTask;
export type ArchiveTaskRoute = typeof archiveTask;
export type UnarchiveTaskRoute = typeof unarchiveTask;
export type ReorderTasksRoute = typeof reorderTasks;
export type AssignUserRoute = typeof assignUser;
export type UnassignUserRoute = typeof unassignUser;
