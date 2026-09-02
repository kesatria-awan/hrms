import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { selectNotificationSchema } from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Notifications"];

// List notifications
export const listNotifications = createRoute({
  method: "get",
  path: "/notifications",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List notifications",
  description: "List all notifications for the authenticated user",
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
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(selectNotificationSchema),
      "List of notifications",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Mark notification as read
export const markNotificationRead = createRoute({
  method: "patch",
  path: "/notifications/{id}/read",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Mark notification as read",
  description: "Mark a single notification as read",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectNotificationSchema,
      "Updated notification",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Notification not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Mark all notifications as read
export const markAllNotificationsRead = createRoute({
  method: "post",
  path: "/notifications/mark-all-read",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Mark all notifications as read",
  description: "Mark all notifications for the authenticated user as read",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ message: z.string() }),
      "All notifications marked as read",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Get unread count
export const getUnreadCount = createRoute({
  method: "get",
  path: "/notifications/unread-count",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Get unread notification count",
  description: "Get the count of unread notifications for the authenticated user",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ count: z.number() }),
      "Unread count",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export type ListNotificationsRoute = typeof listNotifications;
export type MarkNotificationReadRoute = typeof markNotificationRead;
export type MarkAllNotificationsReadRoute = typeof markAllNotificationsRead;
export type GetUnreadCountRoute = typeof getUnreadCount;
