import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { jwtAuth } from "@/api/middlewares/jwt-auth";

const tags = ["Notification Preferences"];

const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
});

export const getPreferences = createRoute({
  method: "get",
  path: "/notification-preferences",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Get notification preferences",
  description: "Get the authenticated user's notification preferences. Upserts defaults if none exist.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ data: preferencesSchema }),
      "Notification preferences",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export const updatePreferences = createRoute({
  method: "patch",
  path: "/notification-preferences",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Update notification preferences",
  request: {
    body: jsonContentRequired(preferencesSchema.partial(), "Preferences to update"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ data: preferencesSchema }),
      "Updated preferences",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export type GetPreferencesRoute = typeof getPreferences;
export type UpdatePreferencesRoute = typeof updatePreferences;