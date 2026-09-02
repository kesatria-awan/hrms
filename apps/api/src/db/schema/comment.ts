import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { tasks } from "./task";
import { users } from "./user";
import { workspaces } from "./workspace";

export const comments = sqliteTable(
  "comments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  table => [
    index("comments_task_idx").on(table.taskId),
    index("comments_workspace_idx").on(table.workspaceId),
    index("comments_user_idx").on(table.userId),
  ],
);

export const insertCommentSchema = createInsertSchema(comments, {
  content: z.string().min(1).max(10000),
}).omit({
  id: true,
  workspaceId: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const selectCommentSchema = createSelectSchema(comments);

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(10000),
});

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
