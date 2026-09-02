import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { workspaces } from "./workspace";

export const userRoles = ["workspace_admin", "member"] as const;
export type UserRole = (typeof userRoles)[number];

export const users = sqliteTable("users", {
  // Clerk user ID (e.g., "user_2abc123def")
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  // New auth columns (per D-07 through D-11)
  avatarUrl: text("avatar_url"), // D-11: alongside imageUrl for BC
  passwordHash: text("password_hash"), // D-07: nullable for OAuth-only users
  passwordHasher: text("password_hasher"), // D-10: "pbkdf2-v1" | "bcrypt"
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp" }), // D-08: null = unverified
  googleId: text("google_id").unique(), // D-09: Google OAuth subject ID
  clerkId: text("clerk_id").unique(), // Preserves Clerk ID after UUID migration
  workspaceId: text("workspace_id").references(() => workspaces.id),
  role: text("role", { enum: userRoles }).notNull().default("member"),
  // Platform-level super admin flag (separate from workspace roles)
  isSuperAdmin: integer("is_super_admin", { mode: "boolean" }).notNull().default(false),
  // Email suppression flag (set via Brevo bounce/unsubscribe webhook)
  emailSuppressed: integer("email_suppressed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const selectUserSchema = createSelectSchema(users);

export const insertUserSchema = createInsertSchema(users, {
  id: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  role: z.enum(userRoles),
}).omit({
  createdAt: true,
  updatedAt: true,
});

export const patchUserSchema = insertUserSchema.partial().omit({
  id: true,
});
