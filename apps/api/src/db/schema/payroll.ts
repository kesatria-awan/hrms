import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { employees } from "./employee";

export const payrollRunStatuses = ["draft", "processing", "completed", "paid", "locked"] as const;
export const salaryComponentTypes = ["earning", "deduction", "employer_contribution"] as const;
export const salaryCalcTypes = ["fixed", "formula", "statutory_table"] as const;

export const salaryComponents = sqliteTable("salary_components", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(), // Basic, EPF Employee, Bonus Tahunan
  code: text("code").unique(),
  type: text("type", { enum: salaryComponentTypes }).notNull(),
  calcType: text("calc_type", { enum: salaryCalcTypes }).notNull().default("fixed"),
  formula: text("formula"), // e.g. "basic * 0.11"
  statutoryTable: text("statutory_table"), // JSON reference to statutory_tables
  isTaxable: integer("is_taxable", { mode: "boolean" }).notNull().default(true),
  doNotIncludeInNet: integer("do_not_include_in_net", { mode: "boolean" }).notNull().default(false),
  isProrated: integer("is_prorated", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const salaryStructures = sqliteTable("salary_structures", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(), // KA Staff 2026
  effectiveFrom: text("effective_from").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const salaryStructureComponents = sqliteTable("salary_structure_components", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  structureId: text("structure_id")
    .notNull()
    .references(() => salaryStructures.id, { onDelete: "cascade" }),
  componentId: text("component_id")
    .notNull()
    .references(() => salaryComponents.id),
  value: real("value").default(0),
  formula: text("formula"),
});

export const salaryStructureAssignments = sqliteTable(
  "salary_structure_assignments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    structureId: text("structure_id")
      .notNull()
      .references(() => salaryStructures.id),
    effectiveFrom: text("effective_from").notNull(),
    baseSalary: real("base_salary").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [index("ssa_employee_idx").on(table.employeeId)],
);

export const payrollRuns = sqliteTable(
  "payroll_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    periodMonth: text("period_month").notNull().unique(), // YYYY-MM
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    status: text("status", { enum: payrollRunStatuses }).notNull().default("draft"),
    totals: text("totals"), // JSON snapshot
    createdBy: text("created_by"),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

export const payslipStatuses = ["draft", "issued", "paid"] as const;

export const payslips = sqliteTable(
  "payslips",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    payrollId: text("payroll_id").references(() => payrollRuns.id),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    periodMonth: text("period_month").notNull(), // YYYY-MM
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    grossPay: real("gross_pay").notNull().default(0),
    totalDeductions: real("total_deductions").notNull().default(0),
    netPay: real("net_pay").notNull().default(0),
    paymentDays: integer("payment_days"),
    absentDays: real("absent_days").notNull().default(0),
    lwpDays: real("lwp_days").notNull().default(0),
    // statutory snapshot
    epfEmployee: real("epf_employee").notNull().default(0),
    epfEmployer: real("epf_employer").notNull().default(0),
    socsoEmployee: real("socso_employee").notNull().default(0),
    socsoEmployer: real("socso_employer").notNull().default(0),
    eisEmployee: real("eis_employee").notNull().default(0),
    eisEmployer: real("eis_employer").notNull().default(0),
    pcb: real("pcb").notNull().default(0),
    zakat: real("zakat").notNull().default(0),
    lineItems: text("line_items"), // JSON snapshot [{component, type, amount}]
    pdfKey: text("pdf_key"), // R2 key
    sentAt: integer("sent_at", { mode: "timestamp" }),
    status: text("status", { enum: payslipStatuses }).notNull().default("draft"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    uniqueIndex("payslips_emp_period_unique").on(table.employeeId, table.periodMonth),
    index("payslips_period_idx").on(table.periodMonth),
  ],
);

// Versioned statutory rate tables (EPF/SOCSO/EIS/PCB change yearly)
export const statutoryTables = sqliteTable(
  "statutory_tables",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    kind: text("kind", { enum: ["epf", "socso", "eis", "pcb"] }).notNull(),
    effectiveFrom: text("effective_from").notNull(),
    tableJson: text("table_json").notNull(), // bracket table as JSON
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [index("statutory_kind_idx").on(table.kind)],
);

export const selectPayrollRunSchema = createSelectSchema(payrollRuns);
export const selectPayslipSchema = createSelectSchema(payslips);

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type Payslip = typeof payslips.$inferSelect;
export type SalaryComponent = typeof salaryComponents.$inferSelect;