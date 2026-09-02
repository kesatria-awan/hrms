import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { selectUserSchema } from "@/api/db/schema/user";

import type { ListUsersRoute } from "./user.routes";

export const listUsers: AppRouteHandler<ListUsersRoute> = async (c) => {
  const db = createDb(c.env);
  const dbUsers = await db.query.users.findMany();

  if (dbUsers.length === 0) {
    c.var.logger.info("Not found");
    return c.json({ message: "Users not found" }, HttpStatusCodes.NOT_FOUND);
  }
  return c.json(selectUserSchema.array().parse(dbUsers), HttpStatusCodes.OK);
};
