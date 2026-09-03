import { eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { notificationPreferences } from "@/api/db/schema";

import type { GetPreferencesRoute, UpdatePreferencesRoute } from "./notification-preferences.routes";

/**
 * Notification preferences — HR categories
 */
export const getPreferences: AppRouteHandler<GetPreferencesRoute> = async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env);

  let [prefs] = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId)).limit(1);

  if (!prefs) {
    // default: all enabled
    [prefs] = await db.insert(notificationPreferences)
      .values({ userId })
      .returning();
  }

  return c.json({ data: prefs }, HttpStatusCodes.OK);
};

export const updatePreferences: AppRouteHandler<UpdatePreferencesRoute> = async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const db = createDb(c.env);

  let [prefs] = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId)).limit(1);

  if (!prefs) {
    [prefs] = await db.insert(notificationPreferences)
      .values({ userId, ...body })
      .returning();
  } else {
    [prefs] = await db.update(notificationPreferences)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId))
      .returning();
  }

  return c.json({ data: prefs }, HttpStatusCodes.OK);
};