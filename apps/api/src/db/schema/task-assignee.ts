import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { tasks } from "./task";
import { users } from "./user";

export const taskAssignees = sqliteTable(
  "task_assignees",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: integer("assigned_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    dueDateEmailSent: integer("due_date_email_sent", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  table => [
    uniqueIndex("task_assignee_unique_idx").on(table.taskId, table.userId),
  ],
);

export const insertTaskAssigneeSchema = createInsertSchema(taskAssignees, {
  userId: z.string().min(1),
}).omit({
  id: true,
  taskId: true,
  assignedAt: true,
  dueDateEmailSent: true,
});

export const selectTaskAssigneeSchema = createSelectSchema(taskAssignees);

export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type NewTaskAssignee = typeof taskAssignees.$inferInsert;
