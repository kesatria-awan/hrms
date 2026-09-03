import { and, desc, eq, isNull } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { attachments, employees } from "@/api/db/schema";

import type {
  DeleteAttachmentRoute,
  GetDownloadUrlRoute,
  ListAttachmentsRoute,
  RequestUploadRoute,
} from "./attachment.routes";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * R2-backed attachments for HR context objects
 * (leave applications, expense claims, employee documents, payslips).
 */

export const requestUpload: AppRouteHandler<RequestUploadRoute> = async (c) => {
  const userId = c.get("userId");
  const { fileName, mimeType, sizeBytes, contextType, contextId } = c.req.valid("json");

  if (sizeBytes > MAX_FILE_SIZE) {
    return c.json({ message: "File too large (max 10MB)" }, HttpStatusCodes.BAD_REQUEST);
  }

  const db = createDb(c.env);
  const r2Key = `attachments/${contextType}/${crypto.randomUUID()}/${fileName}`;

  const [row] = await db.insert(attachments).values({
    uploadedByUserId: userId,
    fileName,
    mimeType,
    sizeBytes,
    r2Key,
    contextType,
    contextId,
  }).returning();

  return c.json({ attachmentId: row.id, r2Key }, HttpStatusCodes.CREATED);
};

export const getDownloadUrl: AppRouteHandler<GetDownloadUrlRoute> = async (c) => {
  const userId = c.get("userId");
  const userRole = c.get("userRole");
  const id = c.req.param("id");

  const db = createDb(c.env);
  const [row] = await db.select().from(attachments)
    .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
    .limit(1);

  if (!row) {
    return c.json({ message: "Not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Employees may only access attachments tied to their own employee record
  if (userRole !== "hr_admin" && row.employeeId) {
    const [me] = await db.select({ id: employees.id }).from(employees)
      .where(eq(employees.userId, userId)).limit(1);
    if (!me || me.id !== row.employeeId) {
      return c.json({ message: "Forbidden" }, HttpStatusCodes.FORBIDDEN);
    }
  }

  const obj = await c.env.R2_BUCKET.get(row.r2Key);
  if (!obj) {
    return c.json({ message: "File missing in storage" }, HttpStatusCodes.NOT_FOUND);
  }

  return c.newResponse(obj.body, 200, {
    "Content-Type": row.mimeType,
    "Content-Disposition": `inline; filename="${row.fileName}"`,
  });
};

export const listAttachments: AppRouteHandler<ListAttachmentsRoute> = async (c) => {
  const { contextType, contextId } = c.req.valid("query");
  const db = createDb(c.env);

  const rows = await db.select().from(attachments)
    .where(and(
      eq(attachments.contextType, contextType),
      eq(attachments.contextId, contextId),
      isNull(attachments.deletedAt),
    ))
    .orderBy(desc(attachments.createdAt));

  return c.json({ data: rows }, HttpStatusCodes.OK);
};

export const deleteAttachment: AppRouteHandler<DeleteAttachmentRoute> = async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);

  const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!row) {
    return c.json({ message: "Not found" }, HttpStatusCodes.NOT_FOUND);
  }

  await db.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, id));
  return c.json({ message: "Deleted" }, HttpStatusCodes.OK);
};