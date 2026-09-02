import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { users } from "./user";

export const notificationPreferences = sqliteTable("notification_preferences", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  taskNotifications: integer("task_notifications", { mode: "boolean" }).notNull().default(true),
  collaborationNotifications: integer("collaboration_notifications", { mode: "boolean" })
    .notNull()
    .default(true),
  adminNotifications: integer("admin_notifications", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const selectNotificationPreferenceSchema = createSelectSchema(notificationPreferences);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
