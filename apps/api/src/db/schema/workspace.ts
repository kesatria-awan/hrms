import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  clerkOrgId: text("clerk_org_id").unique(), // Clerk organization ID for this workspace
  storageUsedBytes: integer("storage_used_bytes").notNull().default(0),
  storageQuotaBytes: integer("storage_quota_bytes").notNull().default(524288000), // 500MB default (free plan)
  billingType: text("billing_type", { enum: ["subscription", "retainer"] })
    .notNull()
    .default("subscription"),
  plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
  subscriptionStatus: text("subscription_status", { enum: ["none", "active", "cancelling", "past_due"] }).notNull().default("none"),
  chipPurchaseToken: text("chip_purchase_token"),
  chipClientId: text("chip_client_id"),
  billingPeriodStart: integer("billing_period_start", { mode: "timestamp" }),
  billingPeriodEnd: integer("billing_period_end", { mode: "timestamp" }),
  cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const selectWorkspaceSchema = createSelectSchema(workspaces);

export const insertWorkspaceSchema = createInsertSchema(workspaces, {
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
}).omit({
  id: true,
  storageUsedBytes: true,
  storageQuotaBytes: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const patchWorkspaceSchema = insertWorkspaceSchema.partial();
