import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { activityActions, selectActivitySchema } from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Activities"];

// Activity response with user and entity names
const activityWithDetailsSchema = selectActivitySchema.extend({
  user: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string(),
    imageUrl: z.string().nullable(),
  }),
  boardName: z.string().nullable(),
  taskTitle: z.string().nullable(),
});

// List workspace activities
export const listActivities = createRoute({
  method: "get",
  path: "/activities",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List activities",
  description: "List all activities in the workspace",
  request: {
    query: z.object({
      limit: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(1).max(100))
        .optional(),
      offset: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(0))
        .optional(),
      action: z.enum(activityActions).optional(),
      boardId: z.string().uuid().optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(activityWithDetailsSchema),
      "List of activities",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// List activities for a specific task
export const listTaskActivities = createRoute({
  method: "get",
  path: "/tasks/{taskId}/activities",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List task activities",
  description: "List all activities for a specific task",
  request: {
    params: z.object({
      taskId: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(activityWithDetailsSchema),
      "List of task activities",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export type ListActivitiesRoute = typeof listActivities;
export type ListTaskActivitiesRoute = typeof listTaskActivities;
