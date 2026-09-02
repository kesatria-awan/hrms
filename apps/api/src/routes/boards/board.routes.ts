import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import {
  boardMemberRoles,
  insertBoardSchema,
  selectBoardSchema,
  updateBoardSchema,
} from "@/api/db/schema";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Boards"];

// Board access permissions for the current user
const boardAccessSchema = z.object({
  canView: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canEditTasks: z.boolean(),
  canDeleteTasks: z.boolean(),
  canManageMembers: z.boolean(),
  canViewMembers: z.boolean(),
  canComment: z.boolean(),
  canUpload: z.boolean(),
  role: z.enum(["admin", "member", "guest"]).nullable(),
});

// Board response with columns
const boardWithColumnsSchema = selectBoardSchema.extend({
  columns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      position: z.number(),
      isDefault: z.boolean(),
      isDoneColumn: z.boolean(),
    }),
  ),
});

// Board response with columns and current user's access permissions
const boardWithAccessSchema = boardWithColumnsSchema.extend({
  access: boardAccessSchema,
});

// List boards
export const listBoards = createRoute({
  method: "get",
  path: "/boards",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List boards",
  description: "List all boards the user has access to in the current workspace",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(selectBoardSchema),
      "List of boards",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Get single board
export const getBoard = createRoute({
  method: "get",
  path: "/boards/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Get board",
  description: "Get a board by ID with its columns",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(boardWithAccessSchema, "Board details with access permissions"),
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

// Create board
export const createBoard = createRoute({
  method: "post",
  path: "/boards",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Create board",
  description: "Create a new board in the current workspace",
  request: {
    body: jsonContentRequired(
      insertBoardSchema.pick({
        name: true,
        description: true,
        color: true,
        autoArchiveDoneDays: true,
      }),
      "Board data",
    ),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      boardWithColumnsSchema,
      "Created board",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Validation error or limit exceeded"),
      "Validation error or limit exceeded",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Update board
export const updateBoard = createRoute({
  method: "patch",
  path: "/boards/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update board",
  description: "Update a board's settings",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContentRequired(updateBoardSchema, "Board update data"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectBoardSchema, "Updated board"),
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

// Delete board (soft delete)
export const deleteBoard = createRoute({
  method: "delete",
  path: "/boards/{id}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Delete board",
  description: "Soft delete a board",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Board deleted",
    },
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

// Add board member
export const addBoardMember = createRoute({
  method: "post",
  path: "/boards/{id}/members",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Add board member",
  description: "Add a user as a member of the board",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContentRequired(
      z.object({
        userId: z.string(),
        role: z.enum(boardMemberRoles).default("member"),
      }),
      "Member data",
    ),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({
        id: z.string(),
        boardId: z.string(),
        userId: z.string(),
        role: z.enum(boardMemberRoles),
        createdAt: z.date(),
      }),
      "Added member",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Board not found"),
      "Board not found",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("User is already a member"),
      "Already a member",
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

// Remove board member
export const removeBoardMember = createRoute({
  method: "delete",
  path: "/boards/{id}/members/{userId}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Remove board member",
  description: "Remove a user from the board",
  request: {
    params: z.object({
      id: z.string().uuid(),
      userId: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Member removed",
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Board or member not found"),
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

// List board members
export const listBoardMembers = createRoute({
  method: "get",
  path: "/boards/{id}/members",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List board members",
  description: "List all members of a board with their roles",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        members: z.array(
          z.object({
            id: z.string(),
            boardId: z.string(),
            userId: z.string(),
            role: z.enum(boardMemberRoles),
            createdAt: z.date(),
            user: z.object({
              id: z.string(),
              email: z.string(),
              firstName: z.string().nullable(),
              lastName: z.string().nullable(),
              imageUrl: z.string().nullable(),
            }),
          }),
        ),
      }),
      "List of board members",
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

// Update board member role
export const updateBoardMemberRole = createRoute({
  method: "patch",
  path: "/boards/{id}/members/{userId}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update board member role",
  description: "Change a board member's role (admin/member/guest)",
  request: {
    params: z.object({
      id: z.string().uuid(),
      userId: z.string(),
    }),
    body: jsonContentRequired(
      z.object({
        role: z.enum(boardMemberRoles),
      }),
      "New role",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        id: z.string(),
        boardId: z.string(),
        userId: z.string(),
        role: z.enum(boardMemberRoles),
        createdAt: z.date(),
      }),
      "Updated member",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Board or member not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Cannot change role - board must have at least one admin"),
      "Validation error",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

export type ListBoardsRoute = typeof listBoards;
export type GetBoardRoute = typeof getBoard;
export type CreateBoardRoute = typeof createBoard;
export type UpdateBoardRoute = typeof updateBoard;
export type DeleteBoardRoute = typeof deleteBoard;
export type AddBoardMemberRoute = typeof addBoardMember;
export type RemoveBoardMemberRoute = typeof removeBoardMember;
export type ListBoardMembersRoute = typeof listBoardMembers;
export type UpdateBoardMemberRoleRoute = typeof updateBoardMemberRole;
