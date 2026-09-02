import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { boards } from "./board";

export const columns = sqliteTable(
  "columns",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isDoneColumn: integer("is_done_column", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    index("columns_board_idx").on(table.boardId),
  ],
);

export const insertColumnSchema = createInsertSchema(columns, {
  name: z.string().min(1).max(50),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isDoneColumn: z.boolean().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectColumnSchema = createSelectSchema(columns);

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  isDoneColumn: z.boolean().optional(),
});

export const reorderColumnsSchema = z.object({
  columnIds: z.array(z.string().uuid()).min(1).max(7),
});

export type Column = typeof columns.$inferSelect;
export type NewColumn = typeof columns.$inferInsert;

// Default columns to create when a new board is created
export const DEFAULT_COLUMNS = [
  { name: "To Do", position: 0, isDefault: true, isDoneColumn: false },
  { name: "In Progress", position: 1, isDefault: false, isDoneColumn: false },
  { name: "Done", position: 2, isDefault: false, isDoneColumn: true },
];
