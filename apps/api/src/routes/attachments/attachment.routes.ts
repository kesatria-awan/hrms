import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_NAME_LENGTH,
  MAX_FILE_SIZE,
  selectAttachmentSchema,
} from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Attachments"];

// Attachment with uploader info
const attachmentWithUploaderSchema = selectAttachmentSchema.extend({
  uploader: z.object({
    id: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    imageUrl: z.string().nullable(),
  }),
});

// Upload file (multipart form data)
export const requestUpload = createRoute({
  method: "post",
  path: "/tasks/{taskId}/attachments",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Upload file attachment",
  description: "Upload a file attachment to a task via multipart form data",
  request: {
    params: z.object({
      taskId: z.string().uuid(),
    }),
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.instanceof(File),
            fileName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
            fileSize: z.coerce.number().int().positive().max(MAX_FILE_SIZE),
            mimeType: z.enum(ALLOWED_MIME_TYPES),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      selectAttachmentSchema,
      "Attachment record",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Forbidden",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Validation error or storage quota exceeded"),
      "Unprocessable entity",
    ),
  },
});

// Download file (streamed)
export const getDownloadUrl = createRoute({
  method: "get",
  path: "/attachments/{id}/download",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Download attachment",
  description: "Download an attachment file",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: "File binary stream",
      content: {
        "application/octet-stream": {
          schema: z.any(),
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Attachment not ready for download"),
      "Bad request",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Forbidden",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Attachment not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Delete attachment
export const deleteAttachment = createRoute({
  method: "delete",
  path: "/attachments/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Delete attachment",
  description: "Soft delete an attachment",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Attachment deleted",
    },
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Forbidden",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Attachment not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// List attachments for a task
export const listAttachments = createRoute({
  method: "get",
  path: "/tasks/{taskId}/attachments",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List attachments",
  description: "List all attachments for a task",
  request: {
    params: z.object({
      taskId: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(attachmentWithUploaderSchema),
      "List of attachments",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// List all attachments in workspace (workspace-level)
export const listWorkspaceAttachments = createRoute({
  method: "get",
  path: "/attachments",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List workspace attachments",
  description: "List all attachments across the workspace with pagination and search",
  request: {
    query: z.object({
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        attachments: z.array(
          selectAttachmentSchema.extend({
            uploader: z.object({
              id: z.string(),
              firstName: z.string().nullable(),
              lastName: z.string().nullable(),
              imageUrl: z.string().nullable(),
            }),
            task: z.object({
              id: z.string(),
              title: z.string(),
            }),
            board: z.object({
              id: z.string(),
              name: z.string(),
              color: z.string(),
            }),
          }),
        ),
        pagination: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          totalPages: z.number(),
        }),
        storage: z.object({
          usedBytes: z.number(),
          quotaBytes: z.number(),
          totalFiles: z.number(),
        }),
      }),
      "Workspace attachments with pagination and storage info",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export type RequestUploadRoute = typeof requestUpload;
export type GetDownloadUrlRoute = typeof getDownloadUrl;
export type DeleteAttachmentRoute = typeof deleteAttachment;
export type ListAttachmentsRoute = typeof listAttachments;
export type ListWorkspaceAttachmentsRoute = typeof listWorkspaceAttachments;
