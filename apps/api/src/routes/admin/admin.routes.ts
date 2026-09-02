import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { superAdminGuard } from "@/api/middlewares/tenant-guard";

const tags = ["Admin"];

// Response schema for workspace in admin context
const workspaceAdminSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  ownerId: z.string(),
  clerkOrgId: z.string().nullable(),
  storageUsedBytes: z.number(),
  storageQuotaBytes: z.number(),
  billingType: z.enum(["subscription", "retainer"]),
  plan: z.enum(["free", "pro"]),
  subscriptionStatus: z.enum(["none", "active", "cancelling", "past_due"]),
  billingPeriodStart: z.number().nullable(),
  billingPeriodEnd: z.number().nullable(),
  cancelledAt: z.number().nullable(),
  memberCount: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// List all workspaces (Super Admin only)
export const listAdminWorkspaces = createRoute({
  method: "get",
  path: "/admin/workspaces",
  tags,
  middleware: [jwtAuth(), superAdminGuard()] as const,
  summary: "List all workspaces (Super Admin)",
  description:
    "List all workspaces across the platform with usage statistics. Super admin access required.",
  request: {
    query: z.object({
      limit: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(1).max(100))
        .optional(),
      offset: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(0))
        .optional(),
      includeDeleted: z
        .string()
        .transform(v => v === "true")
        .optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        workspaces: z.array(workspaceAdminSchema),
        totalCount: z.number(),
      }),
      "List of all workspaces",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Forbidden: Super admin access required"),
      "Forbidden",
    ),
  },
});

// Workspace detail schema with additional info
const workspaceDetailSchema = workspaceAdminSchema.extend({
  owner: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    })
    .nullable(),
  boardCount: z.number(),
  taskCount: z.number(),
});

// Get workspace details (Super Admin only)
export const getAdminWorkspace = createRoute({
  method: "get",
  path: "/admin/workspaces/{id}",
  tags,
  middleware: [jwtAuth(), superAdminGuard()] as const,
  summary: "Get workspace details (Super Admin)",
  description:
    "Get detailed workspace information including owner and resource counts.",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(workspaceDetailSchema, "Workspace details"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Forbidden: Super admin access required"),
      "Forbidden",
    ),
  },
});

// Update workspace (Super Admin only)
export const updateAdminWorkspace = createRoute({
  method: "patch",
  path: "/admin/workspaces/{id}",
  tags,
  middleware: [jwtAuth(), superAdminGuard()] as const,
  summary: "Update workspace (Super Admin)",
  description: "Update workspace settings. Super admin access required.",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: jsonContent(
      z.object({
        name: z.string().min(1).max(100).optional(),
        storageQuotaBytes: z.number().int().min(0).optional(),
        billingType: z.enum(["subscription", "retainer"]).optional(),
        plan: z.enum(["free", "pro"]).optional(),
      }),
      "Workspace update data",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(workspaceAdminSchema, "Updated workspace"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Not found",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("No updates provided"),
      "Validation error",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Forbidden: Super admin access required"),
      "Forbidden",
    ),
  },
});

// Delete workspace (Super Admin only)
export const deleteAdminWorkspace = createRoute({
  method: "delete",
  path: "/admin/workspaces/{id}",
  tags,
  middleware: [jwtAuth(), superAdminGuard()] as const,
  summary: "Delete workspace (Super Admin)",
  description: "Soft delete a workspace. Super admin access required.",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: "Workspace deleted" },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Not found",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("Workspace already deleted"),
      "Conflict",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Forbidden: Super admin access required"),
      "Forbidden",
    ),
  },
});

// User schema for admin context
const userAdminSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  role: z.string(),
  isSuperAdmin: z.boolean(),
  workspace: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// List all users (Super Admin only)
export const listAdminUsers = createRoute({
  method: "get",
  path: "/admin/users",
  tags,
  middleware: [jwtAuth(), superAdminGuard()] as const,
  summary: "List all users (Super Admin)",
  description: "List all users across the platform. Super admin access required.",
  request: {
    query: z.object({
      limit: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(1).max(100))
        .optional(),
      offset: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(0))
        .optional(),
      workspaceId: z.string().uuid().optional(),
      role: z.enum(["workspace_admin", "member"]).optional(),
      isSuperAdmin: z.string().transform(v => v === "true").optional(),
      search: z.string().optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        users: z.array(userAdminSchema),
        totalCount: z.number(),
      }),
      "List of all users",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Forbidden: Super admin access required"),
      "Forbidden",
    ),
  },
});

// Audit log schema
const auditLogSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actor: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    })
    .nullable(),
  workspaceId: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.number(),
});

// List audit logs (Super Admin only)
export const listAuditLogs = createRoute({
  method: "get",
  path: "/admin/audit-logs",
  tags,
  middleware: [jwtAuth(), superAdminGuard()] as const,
  summary: "View audit logs (Super Admin)",
  description: "View audit trail of admin actions. Super admin access required.",
  request: {
    query: z.object({
      limit: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(1).max(100))
        .optional(),
      offset: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .pipe(z.number().int().min(0))
        .optional(),
      actorId: z.string().optional(),
      action: z.string().optional(),
      workspaceId: z.string().uuid().optional(),
      startDate: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .optional(),
      endDate: z
        .string()
        .transform(v => Number.parseInt(v, 10))
        .optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        auditLogs: z.array(auditLogSchema),
        totalCount: z.number(),
      }),
      "List of audit logs",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Forbidden: Super admin access required"),
      "Forbidden",
    ),
  },
});

export type ListAdminWorkspacesRoute = typeof listAdminWorkspaces;
export type GetAdminWorkspaceRoute = typeof getAdminWorkspace;
export type UpdateAdminWorkspaceRoute = typeof updateAdminWorkspace;
export type DeleteAdminWorkspaceRoute = typeof deleteAdminWorkspace;
export type ListAdminUsersRoute = typeof listAdminUsers;
export type ListAuditLogsRoute = typeof listAuditLogs;
