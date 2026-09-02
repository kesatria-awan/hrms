import { eq, sql } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { notificationPreferences } from "@/api/db/schema";

import type { GetPreferencesRoute, UpdatePreferencesRoute } from "./notification-preferences.routes";

export const getPreferences: AppRouteHandler<GetPreferencesRoute> = async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  // Try to get existing preferences
  let [pref] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  // If no row exists, insert defaults and return them
  if (!pref) {
    const [inserted] = await db
      .insert(notificationPreferences)
      .values({ userId })
      .returning();
    pref = inserted;
  }

  return c.json(
    {
      taskNotifications: pref.taskNotifications,
      collaborationNotifications: pref.collaborationNotifications,
      adminNotifications: pref.adminNotifications,
    },
    HttpStatusCodes.OK,
  );
};

export const updatePreferences: AppRouteHandler<UpdatePreferencesRoute> = async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const body = c.req.valid("json");
  const db = createDb(c.env);

  // Upsert: insert or update all 3 fields
  const [pref] = await db
    .insert(notificationPreferences)
    .values({
      userId,
      taskNotifications: body.taskNotifications,
      collaborationNotifications: body.collaborationNotifications,
      adminNotifications: body.adminNotifications,
    })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: {
        taskNotifications: body.taskNotifications,
        collaborationNotifications: body.collaborationNotifications,
        adminNotifications: body.adminNotifications,
        updatedAt: sql`(unixepoch())`,
      },
    })
    .returning();

  return c.json(
    {
      taskNotifications: pref.taskNotifications,
      collaborationNotifications: pref.collaborationNotifications,
      adminNotifications: pref.adminNotifications,
    },
    HttpStatusCodes.OK,
  );
};
