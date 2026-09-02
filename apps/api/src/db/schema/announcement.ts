import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { users } from "./user";
import { workspaces } from "./workspace";

export const announcements = sqliteTable(
  "announcements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    body: text("body"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    index("announcements_workspace_idx").on(table.workspaceId),
  ],
);

export const insertAnnouncementSchema = createInsertSchema(announcements, {
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
}).omit({
  id: true,
  workspaceId: true,
  authorId: true,
  createdAt: true,
});

export const selectAnnouncementSchema = createSelectSchema(announcements);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
