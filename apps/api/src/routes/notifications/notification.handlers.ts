import { and, count, desc, eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { notifications } from "@/api/db/schema";

import type {
  GetUnreadCountRoute,
  ListNotificationsRoute,
  MarkAllNotificationsReadRoute,
  MarkNotificationReadRoute,
} from "./notification.routes";

export const listNotifications: AppRouteHandler<ListNotificationsRoute> = async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const query = c.req.valid("query");
  const db = createDb(c.env);

  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  const notificationList = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json(notificationList, HttpStatusCodes.OK);
};

export const markNotificationRead: AppRouteHandler<MarkNotificationReadRoute> = async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { id } = c.req.valid("param");
  const db = createDb(c.env);

  // Find notification that belongs to current user
  const [notification] = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
      ),
    )
    .limit(1);

  if (!notification) {
    return c.json({ message: "Notification not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Update to read
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, id))
    .returning();

  return c.json(updated, HttpStatusCodes.OK);
};

export const markAllNotificationsRead: AppRouteHandler<MarkAllNotificationsReadRoute> = async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));

  return c.json({ message: "All notifications marked as read" }, HttpStatusCodes.OK);
};

export const getUnreadCount: AppRouteHandler<GetUnreadCountRoute> = async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const [result] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ),
    );

  return c.json({ count: result?.count ?? 0 }, HttpStatusCodes.OK);
};
