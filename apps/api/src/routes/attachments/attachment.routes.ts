import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { selectAttachmentSchema } from "@/api/db/schema/attachment";
import { jwtAuth } from "@/api/middlewares/jwt-auth";

const tags = ["Attachments"];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_NAME_LENGTH = 200;

const contextTypes = [
  "leave_application",
  "expense_claim",
  "employee_document",
  "payslip",
] as const;

const requestUploadSchema = z.object({
  fileName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE),
  contextType: z.enum(contextTypes),
  contextId: z.string().uuid(),
});

export const requestUpload = createRoute({
  method: "post",
  path: "/attachments/request-upload",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Register an attachment before upload",
  description: "Creates the attachment metadata row and returns the R2 key to PUT the file to",
  request: {
    body: jsonContentRequired(requestUploadSchema, "Attachment metadata"),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({ attachmentId: z.string(), r2Key: z.string() }),
      "Attachment registered",
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(createMessageObjectSchema("Invalid input or file too large"), "Invalid input"),
  },
});

export const getDownloadUrl = createRoute({
  method: "get",
  path: "/attachments/{id}/download",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Download an attachment",
  responses: {
    [HttpStatusCodes.OK]: {
      description: "File stream",
      content: { "application/octet-stream": { schema: z.string() } },
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("Not found"), "Not found"),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
  },
});

const listQuery = z.object({
  contextType: z.enum(contextTypes),
  contextId: z.string().uuid(),
});

export const listAttachments = createRoute({
  method: "get",
  path: "/attachments",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "List attachments for a context",
  request: {
    query: listQuery,
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ data: z.array(selectAttachmentSchema) }),
      "Attachments",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(createMessageObjectSchema("Unauthorized"), "Unauthorized"),
  },
});

export const deleteAttachment = createRoute({
  method: "delete",
  path: "/attachments/{id}",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Soft-delete an attachment",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("Deleted"), "Deleted"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("Not found"), "Not found"),
  },
});

export type RequestUploadRoute = typeof requestUpload;
export type GetDownloadUrlRoute = typeof getDownloadUrl;
export type ListAttachmentsRoute = typeof listAttachments;
export type DeleteAttachmentRoute = typeof deleteAttachment;