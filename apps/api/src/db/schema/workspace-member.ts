import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { users } from "./user";
import { workspaces } from "./workspace";

export const workspaceMemberRoles = ["owner", "admin", "user"] as const;
export type WorkspaceMemberRole = (typeof workspaceMemberRoles)[number];

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: workspaceMemberRoles }).notNull().default("user"),
    canManageBilling: integer("can_manage_billing", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    uniqueIndex("workspace_members_workspace_user_idx").on(table.workspaceId, table.userId),
  ],
);

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers, {
  role: z.enum(workspaceMemberRoles).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const selectWorkspaceMemberSchema = createSelectSchema(workspaceMembers);

export const updateWorkspaceMemberSchema = z.object({
  role: z.enum(workspaceMemberRoles),
});

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
