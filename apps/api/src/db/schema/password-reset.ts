import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { users } from "./user";

export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  table => [
    index("password_resets_user_id_idx").on(table.userId),
  ],
);

export const selectPasswordResetSchema = createSelectSchema(passwordResets);
export const insertPasswordResetSchema = createInsertSchema(passwordResets).omit({ id: true, createdAt: true });
