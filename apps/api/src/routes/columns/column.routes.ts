import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import {
  insertColumnSchema,
  reorderColumnsSchema,
  selectColumnSchema,
  updateColumnSchema,
} from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Columns"];

// Create column
export const createColumn = createRoute({
  method: "post",
  path: "/columns",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Create column",
  description: "Create a new column in a board (max 7 per board)",
  request: {
    body: jsonContentRequired(
      insertColumnSchema.pick({
        boardId: true,
        name: true,
        isDoneColumn: true,
      }),
      "Column data",
    ),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(selectColumnSchema, "Created column"),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Maximum columns limit reached"),
      "Limit exceeded",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Board not found"),
      "Board not found",
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

// Update column
export const updateColumn = createRoute({
  method: "patch",
  path: "/columns/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update column",
  description: "Update a column's name or settings",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContentRequired(updateColumnSchema, "Column update data"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectColumnSchema, "Updated column"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Column not found"),
      "Column not found",
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

// Delete column
export const deleteColumn = createRoute({
  method: "delete",
  path: "/columns/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Delete column",
  description: "Delete a column (cannot delete default column or column with tasks)",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Column deleted",
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Column not found"),
      "Column not found",
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Cannot delete default column or column with tasks"),
      "Cannot delete",
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

// Reorder columns
export const reorderColumns = createRoute({
  method: "patch",
  path: "/boards/{boardId}/columns/reorder",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Reorder columns",
  description: "Reorder columns in a board by providing the new order of column IDs",
  request: {
    params: z.object({
      boardId: z.string().uuid(),
    }),
    body: jsonContentRequired(reorderColumnsSchema, "Column order"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(selectColumnSchema),
      "Reordered columns",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Board not found"),
      "Board not found",
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Invalid column IDs"),
      "Invalid IDs",
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

export type CreateColumnRoute = typeof createColumn;
export type UpdateColumnRoute = typeof updateColumn;
export type DeleteColumnRoute = typeof deleteColumn;
export type ReorderColumnsRoute = typeof reorderColumns;
