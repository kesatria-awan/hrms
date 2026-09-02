import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

/**
 * Audit log actions for super admin operations.
 * Only tracks data mutations, not read operations.
 */
export const auditActions = [
  "workspace_updated",
  "workspace_deleted",
  "workspace_settings_updated",
  "member_invited",
  "member_removed",
  "member_role_updated",
  "subscription_created",
  "subscription_renewed",
  "subscription_cancelled",
  "subscription_payment_failed",
  "subscription_downgraded",
  "billing_permission_granted",
  "billing_permission_revoked",
] as const;

export type AuditAction = (typeof auditActions)[number];

/**
 * Resource types that can be audited.
 */
export const auditResourceTypes = ["workspace", "user", "audit_log", "billing"] as const;

export type AuditResourceType = (typeof auditResourceTypes)[number];

/**
 * Audit logs table - immutable record of all super admin actions.
 * Note: No deletedAt field - audit logs cannot be deleted.
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id").notNull(), // Clerk user ID of super admin
    workspaceId: text("workspace_id"), // Target workspace (nullable for global actions)
    action: text("action", { enum: auditActions }).notNull(),
    resourceType: text("resource_type", { enum: auditResourceTypes }).notNull(),
    resourceId: text("resource_id"), // ID of affected resource
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    // NOTE: No deletedAt - audit logs are immutable
  },
  table => [
    index("audit_logs_actor_idx").on(table.actorId),
    index("audit_logs_workspace_idx").on(table.workspaceId),
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_action_idx").on(table.action),
  ],
);

export const selectAuditLogSchema = createSelectSchema(auditLogs);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
