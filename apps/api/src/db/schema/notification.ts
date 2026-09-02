import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { users } from "./user";
import { workspaces } from "./workspace";

export const notificationTypes = ["mention", "assignment", "due_date", "task_overdue"] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const resourceTypes = ["task", "board", "comment"] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    type: text("type", { enum: notificationTypes }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    resourceType: text("resource_type", { enum: resourceTypes }),
    resourceId: text("resource_id"),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    index("notifications_user_idx").on(table.userId),
    index("notifications_user_read_idx").on(table.userId, table.isRead),
    index("notifications_user_workspace_idx").on(table.userId, table.workspaceId),
  ],
);

export const selectNotificationSchema = createSelectSchema(notifications);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
