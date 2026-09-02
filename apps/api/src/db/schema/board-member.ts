import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { boards } from "./board";
import { users } from "./user";

export const boardMemberRoles = ["admin", "member", "guest"] as const;
export type BoardMemberRole = (typeof boardMemberRoles)[number];

export const boardMembers = sqliteTable(
  "board_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: boardMemberRoles }).notNull().default("member"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    uniqueIndex("board_members_board_user_idx").on(table.boardId, table.userId),
  ],
);

export const insertBoardMemberSchema = createInsertSchema(boardMembers, {
  role: z.enum(boardMemberRoles).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const selectBoardMemberSchema = createSelectSchema(boardMembers);

export const updateBoardMemberSchema = z.object({
  role: z.enum(boardMemberRoles),
});

export type BoardMember = typeof boardMembers.$inferSelect;
export type NewBoardMember = typeof boardMembers.$inferInsert;
