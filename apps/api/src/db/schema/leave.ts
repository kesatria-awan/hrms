import { employees as employeesTable } from "./employee";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const leaveTypes = sqliteTable("leave_types", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(), // Annual Leave, Compassionate Leave - Paternity
  code: text("code").unique(), // AL, ML, PAT, MAT
  defaultDays: integer("default_days").notNull().default(0),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(true),
  isLwp: integer("is_lwp", { mode: "boolean" }).notNull().default(false), // leave without pay
  requiresAttachment: integer("requires_attachment", { mode: "boolean" }).notNull().default(false),
  genderRestriction: text("gender_restriction"), // male | female | null
  carryForwardMax: integer("carry_forward_max").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const holidayLists = sqliteTable("holiday_lists", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(), // Malaysia Holidays 2026 (KL)
  year: integer("year").notNull(),
  state: text("state"), // W.P. Kuala Lumpur
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const holidays = sqliteTable(
  "holidays",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    holidayListId: text("holiday_list_id")
      .notNull()
      .references(() => holidayLists.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    description: text("description").notNull(),
  },
  table => [index("holidays_list_idx").on(table.holidayListId)],
);

export const leaveBalances = sqliteTable(
  "leave_balances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    leaveTypeId: text("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    year: integer("year").notNull(),
    entitled: integer("entitled").notNull().default(0),
    carriedForward: integer("carried_forward").notNull().default(0),
    used: integer("used").notNull().default(0),
    pending: integer("pending").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    uniqueIndex("leave_balances_emp_type_year_unique").on(
      table.employeeId,
      table.leaveTypeId,
      table.year,
    ),
  ],
);

export const leaveApplicationStatuses = ["pending", "approved", "rejected", "cancelled"] as const;

export const leaveApplications = sqliteTable(
  "leave_applications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    leaveTypeId: text("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    days: integer("days").notNull(), // supports half days via 0.5 steps
    isHalfDay: integer("is_half_day", { mode: "boolean" }).notNull().default(false),
    reason: text("reason"),
    attachmentKey: text("attachment_key"), // R2 key (MC / hospitalization letter)
    status: text("status", { enum: leaveApplicationStatuses }).notNull().default("pending"),
    approverId: text("approver_id"), // users.id
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    rejectionReason: text("rejection_reason"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    index("leave_applications_employee_idx").on(table.employeeId),
    index("leave_applications_status_idx").on(table.status),
  ],
);


export const selectLeaveTypeSchema = createSelectSchema(leaveTypes);
export const insertLeaveApplicationSchema = createInsertSchema(leaveApplications, {
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).omit({
  id: true,
  status: true,
  approverId: true,
  approvedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
});

export type LeaveType = typeof leaveTypes.$inferSelect;
export type NewLeaveType = typeof leaveTypes.$inferInsert;
export type LeaveApplication = typeof leaveApplications.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
export type LeaveBalance = typeof leaveBalances.$inferSelect;