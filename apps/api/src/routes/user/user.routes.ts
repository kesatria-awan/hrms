import { createRoute, z } from "@hono/zod-openapi";
// import { createErrorSchema } from "stoker/openapi/schemas";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";

import { selectUserSchema } from "@/api/db/schema/user";
import { notFoundSchema } from "@/api/lib/constants";

const tags = ["User"];

export const listUsers = createRoute({
  method: "get",
  path: "/",
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContentRequired(z.array(selectUserSchema), "List of users"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(notFoundSchema, "Users not found"),
  },
});

export type ListUsersRoute = typeof listUsers;
