import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { departments } from "./department";
import { designations } from "./department";

export const employmentTypes = ["permanent", "probation", "contract", "freelance", "intern"] as const;
export const employeeStatuses = ["active", "on_leave", "suspended", "resigned", "terminated"] as const;
export const genders = ["male", "female"] as const;

export const employees = sqliteTable(
  "employees",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"), // -> users.id (login); FK added in migration
    employeeNumber: text("employee_number").notNull().unique(), // KA-002, MYS-3901
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    // Org
    departmentId: text("department_id").references(() => departments.id),
    designationId: text("designation_id").references(() => designations.id),
    employmentType: text("employment_type", { enum: employmentTypes }).notNull().default("permanent"),
    status: text("status", { enum: employeeStatuses }).notNull().default("active"),
    dateOfJoining: text("date_of_joining").notNull(), // YYYY-MM-DD
    dateOfResignation: text("date_of_resignation"),
    // Personal (EA 1955)
    nric: text("nric"),
    dateOfBirth: text("date_of_birth"),
    placeOfBirth: text("place_of_birth"),
    gender: text("gender", { enum: genders }),
    race: text("race"),
    religion: text("religion"),
    bloodGroup: text("blood_group"),
    maritalStatus: text("marital_status"),
    nationality: text("nationality").default("Malaysian"),
    bumiStatus: text("bumi_status"),
    address: text("address"),
    // Contact
    personalEmail: text("personal_email"),
    mobileNo: text("mobile_no"),
    phoneNo: text("phone_no"),
    companyEmail: text("company_email").unique(),
    // Bank
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    // Statutory
    epfNo: text("epf_no"),
    socsoNo: text("socso_no"),
    incomeTaxNo: text("income_tax_no"),
    // Emergency
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    // Avatar (R2)
    avatarUrl: text("avatar_url"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  table => [
    index("employees_department_idx").on(table.departmentId),
    index("employees_status_idx").on(table.status),
    uniqueIndex("employees_company_email_unique").on(table.companyEmail),
  ],
);

export const selectEmployeeSchema = createSelectSchema(employees);
export const insertEmployeeSchema = createInsertSchema(employees, {
  firstName: z.string().min(1).max(100),
  employeeNumber: z.string().min(2).max(20),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export const patchEmployeeSchema = insertEmployeeSchema.partial();

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;