import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { employees } from "./employee";
import { payrollRuns } from "./payroll";

export const claimStatuses = ["draft", "submitted", "approved", "rejected", "paid"] as const;

export const expenseClaims = sqliteTable(
  "expense_claims",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    claimNo: text("claim_no").unique(), // CLM-2026-0001
    title: text("title").notNull(),
    // items: [{type, amount, date, description}]
    items: text("items").notNull().default("[]"),
    totalAmount: real("total_amount").notNull().default(0),
    status: text("status", { enum: claimStatuses }).notNull().default("draft"),
    approverId: text("approver_id"),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    rejectionReason: text("rejection_reason"),
    paidInPayrollId: text("paid_in_payroll_id").references(() => payrollRuns.id),
    receiptKeys: text("receipt_keys"), // JSON array of R2 keys
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [index("claims_employee_idx").on(table.employeeId)],
);

export const selectExpenseClaimSchema = createSelectSchema(expenseClaims);
export const insertExpenseClaimSchema = createInsertSchema(expenseClaims, {
  title: z.string().min(1).max(200),
}).omit({
  id: true,
  claimNo: true,
  status: true,
  approverId: true,
  approvedAt: true,
  paidInPayrollId: true,
  createdAt: true,
  updatedAt: true,
});

export type ExpenseClaim = typeof expenseClaims.$inferSelect;
export type NewExpenseClaim = typeof expenseClaims.$inferInsert;