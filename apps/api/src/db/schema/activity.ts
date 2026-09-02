import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { boards } from "./board";
import { tasks } from "./task";
import { users } from "./user";
import { workspaces } from "./workspace";

export const activityActions = [
  "task_created",
  "task_updated",
  "task_moved",
  "task_archived",
  "task_unarchived",
  "task_deleted",
  "assignee_added",
  "assignee_removed",
  "comment_added",
  "comment_deleted",
  "attachment_uploaded",
  "attachment_deleted",
] as const;

export type ActivityAction = (typeof activityActions)[number];

export const activities = sqliteTable(
  "activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    boardId: text("board_id").references(() => boards.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action", { enum: activityActions }).notNull(),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    index("activities_workspace_idx").on(table.workspaceId),
    index("activities_board_idx").on(table.boardId),
    index("activities_task_idx").on(table.taskId),
    index("activities_user_idx").on(table.userId),
    index("activities_created_at_idx").on(table.createdAt),
  ],
);

export const selectActivitySchema = createSelectSchema(activities);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type ActivityMetadata = Record<string, unknown>;
