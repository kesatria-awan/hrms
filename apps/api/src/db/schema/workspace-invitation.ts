import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { workspaces } from "./workspace";

export const invitationRoles = ["admin", "user"] as const;
export type InvitationRole = (typeof invitationRoles)[number];

export const workspaceInvitations = sqliteTable(
  "workspace_invitations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    inviterUserId: text("inviter_user_id").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: invitationRoles }).notNull().default("user"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp" }),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  table => [
    index("workspace_invitations_workspace_id_idx").on(table.workspaceId),
    index("workspace_invitations_email_idx").on(table.email),
  ],
);

export const selectWorkspaceInvitationSchema = createSelectSchema(workspaceInvitations);
export const insertWorkspaceInvitationSchema = createInsertSchema(workspaceInvitations).omit({ id: true, createdAt: true });
