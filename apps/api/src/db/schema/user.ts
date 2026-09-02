import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoles = ["hr_admin", "employee"] as const;
export type UserRole = (typeof userRoles)[number];

export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull().unique(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatarUrl: text("avatar_url"),
    // Role: hr_admin sees everything; employee is self-service
    role: text("role", { enum: userRoles }).notNull().default("employee"),
    // Link to employee record (every staff member should have one)
    employeeId: text("employee_id"),
    // Email OTP login
    otpHash: text("otp_hash"),
    otpExpiresAt: integer("otp_expires_at", { mode: "timestamp" }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    otpLastSentAt: integer("otp_last_sent_at", { mode: "timestamp" }),
    // Future OIDC (authentik)
    oidcSubject: text("oidc_subject").unique(),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp" }),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    emailSuppressed: integer("email_suppressed", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  table => [index("users_email_idx").on(table.email)],
);

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email(),
}).omit({
  id: true,
  otpHash: true,
  otpExpiresAt: true,
  otpAttempts: true,
  otpLastSentAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export const requestOtpSchema = z.object({
  email: z.string().email(),
});
export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;