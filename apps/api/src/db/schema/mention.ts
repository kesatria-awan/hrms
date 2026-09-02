import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { comments } from "./comment";
import { users } from "./user";

export const mentions = sqliteTable(
  "mentions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [uniqueIndex("mention_unique_idx").on(table.commentId, table.userId)],
);

export const selectMentionSchema = createSelectSchema(mentions);

export type Mention = typeof mentions.$inferSelect;
export type NewMention = typeof mentions.$inferInsert;
