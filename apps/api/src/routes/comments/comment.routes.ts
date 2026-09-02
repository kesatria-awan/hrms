import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { selectCommentSchema, updateCommentSchema } from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Comments"];

// Comment response with user and mentions
const commentWithUserSchema = selectCommentSchema.extend({
  user: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string(),
    imageUrl: z.string().nullable(),
  }),
  mentions: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      createdAt: z.date(),
      user: z.object({
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        email: z.string(),
        imageUrl: z.string().nullable(),
      }),
    }),
  ),
});

// Create comment
export const createComment = createRoute({
  method: "post",
  path: "/tasks/{taskId}/comments",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Create comment",
  description: "Create a new comment on a task. Supports @mentions.",
  request: {
    params: z.object({
      taskId: z.string().uuid(),
    }),
    body: jsonContentRequired(
      z.object({
        content: z.string().min(1).max(10000),
      }),
      "Comment content",
    ),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(selectCommentSchema, "Created comment"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Invalid content"),
      "Bad request",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Task not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// List comments for a task
export const listComments = createRoute({
  method: "get",
  path: "/tasks/{taskId}/comments",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List comments",
  description: "List all comments for a task",
  request: {
    params: z.object({
      taskId: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(commentWithUserSchema),
      "List of comments",
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

// Update comment
export const updateComment = createRoute({
  method: "patch",
  path: "/comments/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update comment",
  description: "Update a comment (only the author can update)",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContentRequired(updateCommentSchema, "Comment update data"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectCommentSchema, "Updated comment"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Invalid content"),
      "Bad request",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Not comment author"),
      "Forbidden",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Comment not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Delete comment
export const deleteComment = createRoute({
  method: "delete",
  path: "/comments/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Delete comment",
  description: "Delete a comment (author, board admin, or workspace admin)",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Comment deleted",
    },
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Forbidden",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Comment not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export type CreateCommentRoute = typeof createComment;
export type ListCommentsRoute = typeof listComments;
export type UpdateCommentRoute = typeof updateComment;
export type DeleteCommentRoute = typeof deleteComment;
