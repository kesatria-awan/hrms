import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { tasks } from "./task";
import { users } from "./user";
import { workspaces } from "./workspace";

export const attachmentStatuses = ["pending", "uploaded", "deleted"] as const;
export type AttachmentStatus = (typeof attachmentStatuses)[number];

export const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Text
  "text/plain",
  "text/csv",
  "text/markdown",
  // Archives
  "application/zip",
  "application/gzip",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// Constants for validation
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FILE_NAME_LENGTH = 255;

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    r2Key: text("r2_key").notNull(),
    status: text("status", { enum: attachmentStatuses })
      .notNull()
      .default("pending"),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  table => [
    index("attachments_task_idx").on(table.taskId),
    index("attachments_workspace_idx").on(table.workspaceId),
    index("attachments_status_idx").on(table.status),
    index("attachments_uploaded_by_idx").on(table.uploadedById),
    uniqueIndex("attachments_r2_key_idx").on(table.r2Key),
  ],
);

export const insertAttachmentSchema = createInsertSchema(attachments, {
  fileName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
}).omit({
  id: true,
  workspaceId: true,
  uploadedById: true,
  createdAt: true,
  deletedAt: true,
  status: true,
  r2Key: true,
});

export const selectAttachmentSchema = createSelectSchema(attachments);

// Schema for requesting upload URL
export const requestUploadSchema = z.object({
  fileName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
});

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;
