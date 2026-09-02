import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { employees } from "./employee";

// R2 object metadata for uploaded files (payslip PDFs, contracts, receipts, avatars)
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // owner: employee or user
    employeeId: text("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    r2Key: text("r2_key").notNull().unique(),
    // context: what the file belongs to (leave_application, expense_claim, payslip, employee_document)
    contextType: text("context_type").notNull(),
    contextId: text("context_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  table => [index("attachments_context_idx").on(table.contextType, table.contextId)],
);

export const selectAttachmentSchema = createSelectSchema(attachments);

export type Attachment = typeof attachments.$inferSelect;