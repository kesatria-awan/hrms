import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { employees } from "./employee";

export const documentCategories = [
  "contract",
  "payslip",
  "ea_form",
  "certificate",
  "policy",
  "other",
] as const;

export const employeeDocuments = sqliteTable(
  "employee_documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    category: text("category", { enum: documentCategories }).notNull(),
    title: text("title").notNull(),
    fileKey: text("file_key").notNull(), // R2 key
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploadedBy: text("uploaded_by"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [index("documents_employee_idx").on(table.employeeId)],
);

export const selectDocumentSchema = createSelectSchema(employeeDocuments);

export type EmployeeDocument = typeof employeeDocuments.$inferSelect;