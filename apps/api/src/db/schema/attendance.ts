import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { employees } from "./employee";

export const attendanceStatuses = [
  "present",
  "late",
  "absent",
  "leave",
  "holiday",
  "weekend",
  "half_day",
] as const;
export const attendanceSources = ["checkin", "auto", "manual"] as const;

export const attendanceRecords = sqliteTable(
  "attendance_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    status: text("status", { enum: attendanceStatuses }).notNull(),
    clockIn: integer("clock_in", { mode: "timestamp" }),
    clockOut: integer("clock_out", { mode: "timestamp" }),
    workedMinutes: integer("worked_minutes"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    source: text("source", { enum: attendanceSources }).notNull().default("auto"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    uniqueIndex("attendance_emp_date_unique").on(table.employeeId, table.date),
    index("attendance_date_idx").on(table.date),
  ],
);

export const checkIns = sqliteTable(
  "check_ins",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["in", "out"] }).notNull(),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    // geo/IP metadata for audit
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [index("check_ins_emp_ts_idx").on(table.employeeId, table.timestamp)],
);

export const selectAttendanceSchema = createSelectSchema(attendanceRecords);
export const correctionStatuses = ["pending", "approved", "rejected"] as const;

export const attendanceCorrections = sqliteTable("attendance_corrections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  requestedClockIn: text("requested_clock_in"), // HH:MM
  requestedClockOut: text("requested_clock_out"),
  reason: text("reason").notNull(),
  status: text("status", { enum: correctionStatuses }).notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type AttendanceCorrection = typeof attendanceCorrections.$inferSelect;