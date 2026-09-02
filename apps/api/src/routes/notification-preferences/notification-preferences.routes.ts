import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Notification Preferences"];

const preferencesSchema = z.object({
  taskNotifications: z.boolean(),
  collaborationNotifications: z.boolean(),
  adminNotifications: z.boolean(),
});

export const getPreferences = createRoute({
  method: "get",
  path: "/notification-preferences",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Get notification preferences",
  description: "Get the authenticated user's notification preferences. Upserts defaults if none exist.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      preferencesSchema,
      "Notification preferences",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export const updatePreferences = createRoute({
  method: "put",
  path: "/notification-preferences",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update notification preferences",
  description: "Update the authenticated user's notification preferences (all 3 fields required)",
  request: {
    body: jsonContentRequired(
      preferencesSchema,
      "Notification preferences to update",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      preferencesSchema,
      "Updated notification preferences",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      z.object({ success: z.boolean(), error: z.unknown() }),
      "Validation error",
    ),
  },
});

export type GetPreferencesRoute = typeof getPreferences;
export type UpdatePreferencesRoute = typeof updatePreferences;
