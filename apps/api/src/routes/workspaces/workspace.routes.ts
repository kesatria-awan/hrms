import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { invitationRoles } from "@/api/db/schema/workspace-invitation";
import { workspaceMemberRoles } from "@/api/db/schema/workspace-member";
import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Workspaces"];

// Response schemas
const workspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  role: z.enum(workspaceMemberRoles),
  createdAt: z.number(),
  canManageBilling: z.boolean(),
});

const workspaceInvitationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(invitationRoles),
  inviterName: z.string().nullable(),
  expiresAt: z.number(),
  createdAt: z.number(),
  // E2E_MODE: raw invite token for programmatic acceptance (omitted in production)
  rawToken: z.string().optional(),
});

// List workspace members
export const listWorkspaceMembers = createRoute({
  method: "get",
  path: "/workspaces/{slug}/members",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List workspace members",
  description: "List all members of a workspace",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        members: z.array(workspaceMemberSchema),
        totalCount: z.number(),
      }),
      "List of workspace members",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Workspace not found",
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

// List workspace invitations
export const listWorkspaceInvitations = createRoute({
  method: "get",
  path: "/workspaces/{slug}/invitations",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List pending invitations",
  description: "List all pending invitations for a workspace (admin only)",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        invitations: z.array(workspaceInvitationSchema),
        totalCount: z.number(),
      }),
      "List of pending invitations",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Workspace not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied - admin only"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Create workspace invitation
export const createWorkspaceInvitation = createRoute({
  method: "post",
  path: "/workspaces/{slug}/invitations",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Invite user to workspace",
  description: "Send an invitation email to join the workspace (admin only).",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    body: jsonContentRequired(
      z.object({
        email: z.string().email("Invalid email address"),
        role: z.enum(invitationRoles).default("user"),
      }),
      "Invitation details",
    ),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      workspaceInvitationSchema,
      "Invitation sent",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Workspace not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied - admin only"),
      "Access denied",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("User already invited or member"),
      "Already invited",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Validation error"),
      "Validation error",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Revoke workspace invitation
export const revokeWorkspaceInvitation = createRoute({
  method: "delete",
  path: "/workspaces/{slug}/invitations/{invitationId}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Revoke invitation",
  description: "Cancel a pending invitation (admin only)",
  request: {
    params: z.object({
      slug: z.string(),
      invitationId: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Invitation revoked",
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace or invitation not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied - admin only"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Resend workspace invitation
export const resendWorkspaceInvitation = createRoute({
  method: "post",
  path: "/workspaces/{slug}/invitations/{invitationId}/resend",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Resend invitation",
  description: "Resend invitation email with a new token (admin only)",
  request: {
    params: z.object({ slug: z.string(), invitationId: z.string() }),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(workspaceInvitationSchema, "Invitation resent"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("Invitation not found"), "Not found"),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Access denied"), "Access denied"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(createMessageObjectSchema("Unauthorized"), "Unauthorized"),
  },
});

// Update workspace member role
export const updateWorkspaceMemberRole = createRoute({
  method: "patch",
  path: "/workspaces/{slug}/members/{userId}/role",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update member role",
  description: "Change a member's role in the workspace (admin only)",
  request: {
    params: z.object({
      slug: z.string(),
      userId: z.string(),
    }),
    body: jsonContentRequired(
      z.object({
        role: z.enum(["admin", "user"] as const),
      }),
      "New role",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        id: z.string(),
        userId: z.string(),
        role: z.enum(workspaceMemberRoles),
      }),
      "Updated member",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace or member not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied - admin only"),
      "Access denied",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Cannot demote the last admin"),
      "Validation error",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Remove workspace member
export const removeWorkspaceMember = createRoute({
  method: "delete",
  path: "/workspaces/{slug}/members/{userId}",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Remove member",
  description: "Remove a member from the workspace (admin only, or self-removal)",
  request: {
    params: z.object({
      slug: z.string(),
      userId: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: "Member removed",
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace or member not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied"),
      "Access denied",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Cannot remove the last admin"),
      "Validation error",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Update workspace settings
export const updateWorkspaceSettings = createRoute({
  method: "patch",
  path: "/workspaces/{slug}/settings",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update workspace settings",
  description: "Update workspace name and/or slug (admin only)",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    body: jsonContentRequired(
      z.object({
        name: z.string().min(1).max(100).optional(),
        slug: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
          .optional(),
      }),
      "Settings to update",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        storageUsedBytes: z.number(),
        storageQuotaBytes: z.number(),
      }),
      "Updated workspace",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Workspace not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied - admin only"),
      "Access denied",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("Slug already taken"),
      "Slug conflict",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// List workspace audit logs
export const listWorkspaceAuditLogs = createRoute({
  method: "get",
  path: "/workspaces/{slug}/audit-logs",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "List workspace audit logs",
  description: "List audit log entries scoped to this workspace (admin only)",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    query: z.object({
      page: z.coerce.number().int().min(1).default(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        logs: z.array(
          z.object({
            id: z.string(),
            actorId: z.string(),
            action: z.string(),
            resourceType: z.string(),
            resourceId: z.string().nullable(),
            metadata: z.unknown().nullable(),
            createdAt: z.string(),
            actorEmail: z.string().nullable(),
          }),
        ),
        totalCount: z.number(),
        page: z.number(),
        limit: z.number(),
      }),
      "Paginated audit logs",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Workspace not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Access denied - admin only"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Update member billing permission
export const updateMemberBillingPermission = createRoute({
  method: "patch",
  path: "/workspaces/{slug}/members/{userId}/billing-permission",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Update member billing permission",
  description: "Grant or revoke billing management permission for a member (owner only)",
  request: {
    params: z.object({
      slug: z.string(),
      userId: z.string(),
    }),
    body: jsonContentRequired(
      z.object({
        canManageBilling: z.boolean(),
      }),
      "Billing permission",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        userId: z.string(),
        canManageBilling: z.boolean(),
      }),
      "Updated billing permission",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace or member not found"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Only the workspace owner can manage billing permissions"),
      "Access denied",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema("Unauthorized"),
      "Unauthorized",
    ),
  },
});

// Export route types
export type UpdateMemberBillingPermissionRoute = typeof updateMemberBillingPermission;
export type UpdateWorkspaceSettingsRoute = typeof updateWorkspaceSettings;
export type ListWorkspaceAuditLogsRoute = typeof listWorkspaceAuditLogs;
export type ListWorkspaceMembersRoute = typeof listWorkspaceMembers;
export type ListWorkspaceInvitationsRoute = typeof listWorkspaceInvitations;
export type CreateWorkspaceInvitationRoute = typeof createWorkspaceInvitation;
export type RevokeWorkspaceInvitationRoute = typeof revokeWorkspaceInvitation;
export type ResendWorkspaceInvitationRoute = typeof resendWorkspaceInvitation;
export type UpdateWorkspaceMemberRoleRoute = typeof updateWorkspaceMemberRole;
export type RemoveWorkspaceMemberRoute = typeof removeWorkspaceMember;
