import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { users } from "./user";
import { workspaces } from "./workspace";

export const boardVisibility = ["private", "workspace"] as const;
export type BoardVisibility = (typeof boardVisibility)[number];

export const boards = sqliteTable(
  "boards",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#3B82F6"),
    visibility: text("visibility", { enum: boardVisibility })
      .notNull()
      .default("private"),
    autoArchiveDoneDays: integer("auto_archive_done_days").notNull().default(0),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    position: integer("position").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  table => [
    index("boards_workspace_idx").on(table.workspaceId),
  ],
);

export const insertBoardSchema = createInsertSchema(boards, {
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
  visibility: z.enum(boardVisibility).optional(),
  autoArchiveDoneDays: z.number().int().min(0).max(30).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const selectBoardSchema = createSelectSchema(boards);

export const updateBoardSchema = insertBoardSchema
  .partial()
  .omit({ workspaceId: true, createdById: true, position: true, visibility: true });

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
