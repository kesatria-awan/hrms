import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { insertAnnouncementSchema } from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Announcements"];

const announcementWithAuthorSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  authorId: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  createdAt: z.string(),
  author: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string(),
    imageUrl: z.string().nullable(),
  }),
});

export const listAnnouncements = createRoute({
  method: "get",
  path: "/announcements",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List announcements",
  description: "List announcements for the current workspace",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(announcementWithAuthorSchema),
      "List of announcements",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export const createAnnouncement = createRoute({
  method: "post",
  path: "/announcements",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Create announcement",
  description: "Create a new announcement (admin only)",
  request: {
    body: jsonContentRequired(insertAnnouncementSchema, "Announcement to create"),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      announcementWithAuthorSchema,
      "Created announcement",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Forbidden"),
      "Forbidden - admin only",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      z.object({ message: z.string() }).passthrough(),
      "Validation error",
    ),
  },
});

export type ListAnnouncementsRoute = typeof listAnnouncements;
export type CreateAnnouncementRoute = typeof createAnnouncement;
