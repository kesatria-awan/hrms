import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { boards } from "./board";
import { columns } from "./column";
import { users } from "./user";
import { workspaces } from "./workspace";

export const taskPriorities = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    columnId: text("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority", { enum: taskPriorities })
      .notNull()
      .default("medium"),
    dueDate: integer("due_date", { mode: "timestamp" }),
    position: integer("position").notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  table => [
    index("tasks_workspace_idx").on(table.workspaceId),
    index("tasks_board_idx").on(table.boardId),
    index("tasks_column_idx").on(table.columnId),
  ],
);

export const insertTaskSchema = createInsertSchema(tasks, {
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(taskPriorities).optional(),
  dueDate: z.coerce.date().optional(),
}).omit({
  id: true,
  workspaceId: true,
  createdById: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const selectTaskSchema = createSelectSchema(tasks);

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(taskPriorities).optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const moveTaskSchema = z.object({
  columnId: z.string().uuid(),
  position: z.number().int().min(0),
});

export const reorderTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  columnId: z.string().uuid(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
