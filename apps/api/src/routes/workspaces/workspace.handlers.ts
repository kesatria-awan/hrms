import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { auditLogs, users, workspaceInvitations, workspaceMembers, workspaces } from "@/api/db/schema";
import { getClientInfo, logAdminAction } from "@/api/lib/audit-logger";
import { sendEmail } from "@/api/lib/email";
import { buildInvitationEmail } from "@/api/lib/email-templates";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";
import { hashToken } from "@/api/lib/token";

import type {
  CreateWorkspaceInvitationRoute,
  ListWorkspaceAuditLogsRoute,
  ListWorkspaceInvitationsRoute,
  ListWorkspaceMembersRoute,
  RemoveWorkspaceMemberRoute,
  ResendWorkspaceInvitationRoute,
  RevokeWorkspaceInvitationRoute,
  UpdateMemberBillingPermissionRoute,
  UpdateWorkspaceMemberRoleRoute,
  UpdateWorkspaceSettingsRoute,
} from "./workspace.routes";

/**
 * Get workspace by slug and verify it exists
 */
async function getWorkspaceBySlug(db: ReturnType<typeof createDb>, slug: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  return workspace;
}

/**
 * Check if the calling user's workspaceId matches the target workspace
 */
function isInWorkspace(userWorkspaceId: string | null, workspaceId: string): boolean {
  return !!userWorkspaceId && userWorkspaceId === workspaceId;
}

/**
 * Check if the calling user is a workspace admin (owner or admin role)
 */
function isWorkspaceAdmin(workspaceRole: string | null | undefined, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin)
    return true;
  return workspaceRole === "owner" || workspaceRole === "admin";
}

// List workspace members
export const listWorkspaceMembers: AppRouteHandler<ListWorkspaceMembersRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace (super admins bypass)
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  const members = await db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      imageUrl: users.avatarUrl,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspace.id));

  // Fetch billing permissions
  const billingPerms = await db
    .select({ userId: workspaceMembers.userId, canManageBilling: workspaceMembers.canManageBilling })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspace.id));

  const billingPermMap = new Map(billingPerms.map(m => [m.userId, m.canManageBilling]));

  return c.json({
    members: members.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.email ?? "",
      firstName: m.firstName ?? null,
      lastName: m.lastName ?? null,
      imageUrl: m.imageUrl ?? null,
      role: m.role,
      createdAt: m.createdAt instanceof Date ? m.createdAt.getTime() : Number(m.createdAt),
      canManageBilling: billingPermMap.get(m.userId) ?? false,
    })),
    totalCount: members.length,
  }, HttpStatusCodes.OK);
};

// List workspace invitations
export const listWorkspaceInvitations: AppRouteHandler<ListWorkspaceInvitationsRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Admin only
  if (!isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  const invitations = await db
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      expiresAt: workspaceInvitations.expiresAt,
      createdAt: workspaceInvitations.createdAt,
      inviterFirstName: users.firstName,
      inviterLastName: users.lastName,
    })
    .from(workspaceInvitations)
    .leftJoin(users, eq(workspaceInvitations.inviterUserId, users.id))
    .where(
      and(
        eq(workspaceInvitations.workspaceId, workspace.id),
        isNull(workspaceInvitations.usedAt),
        isNull(workspaceInvitations.revokedAt),
      ),
    );

  return c.json({
    invitations: invitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      inviterName: [inv.inviterFirstName, inv.inviterLastName].filter(Boolean).join(" ") || null,
      expiresAt: inv.expiresAt instanceof Date ? inv.expiresAt.getTime() : Number(inv.expiresAt),
      createdAt: inv.createdAt instanceof Date ? inv.createdAt.getTime() : Number(inv.createdAt),
    })),
    totalCount: invitations.length,
  }, HttpStatusCodes.OK);
};

// Create workspace invitation
export const createWorkspaceInvitation: AppRouteHandler<CreateWorkspaceInvitationRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const { email, role } = c.req.valid("json");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Admin only
  if (!isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check if email is already a member
  const [existingMember] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(users.email, email),
      ),
    )
    .limit(1);

  if (existingMember) {
    return c.json(
      { message: `${email} is already a member of this workspace.` },
      HttpStatusCodes.CONFLICT,
    );
  }

  // Check for duplicate pending invitation (D-10)
  const [existingInvitation] = await db
    .select({ id: workspaceInvitations.id })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.workspaceId, workspace.id),
        eq(workspaceInvitations.email, email),
        isNull(workspaceInvitations.usedAt),
        isNull(workspaceInvitations.revokedAt),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existingInvitation) {
    return c.json(
      { message: "This email already has a pending invitation. Revoke or resend the existing invitation." },
      HttpStatusCodes.CONFLICT,
    );
  }

  // Generate token
  const rawToken = crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);
  const inviterUserId = c.get("userId");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invitation] = await db
    .insert(workspaceInvitations)
    .values({
      workspaceId: workspace.id,
      inviterUserId,
      email,
      role,
      tokenHash,
      expiresAt,
    })
    .returning();

  // Get inviter name for email
  const [inviter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, inviterUserId))
    .limit(1);

  const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") || "Someone";

  // Send invitation email
  const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";
  await sendEmail(c.env, {
    to: { email },
    subject: `You've been invited to join ${workspace.name} on Tracky`,
    htmlContent: buildInvitationEmail({
      inviteUrl: `${frontendUrl}/invite?token=${rawToken}`,
      workspaceName: workspace.name,
      inviterName,
      role,
    }),
  }).catch((err) => {
    c.var.logger?.error({ err, email }, "Failed to send invitation email");
  });

  // Log audit event
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: inviterUserId,
    action: "member_invited",
    resourceType: "workspace",
    workspaceId: workspace.id,
    resourceId: invitation.id,
    metadata: { email, role },
    ipAddress,
    userAgent,
  });

  // E2E_MODE: expose raw token so setup script can programmatically accept invites
  return c.json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    inviterName,
    expiresAt: invitation.expiresAt instanceof Date ? invitation.expiresAt.getTime() : Number(invitation.expiresAt),
    createdAt: invitation.createdAt instanceof Date ? invitation.createdAt.getTime() : Number(invitation.createdAt),
    ...(c.env.E2E_MODE === "true" ? { rawToken } : {}),
  }, HttpStatusCodes.CREATED);
};

// Revoke workspace invitation (hard-delete)
export const revokeWorkspaceInvitation: AppRouteHandler<RevokeWorkspaceInvitationRoute> = async (c) => {
  const { slug, invitationId } = c.req.valid("param");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Admin only
  if (!isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  const deleted = await db
    .delete(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, workspace.id),
      ),
    )
    .returning({ id: workspaceInvitations.id });

  if (deleted.length === 0) {
    return c.json({ message: "Invitation not found" }, HttpStatusCodes.NOT_FOUND);
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

// Resend workspace invitation
export const resendWorkspaceInvitation: AppRouteHandler<ResendWorkspaceInvitationRoute> = async (c) => {
  const { slug, invitationId } = c.req.valid("param");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Admin only
  if (!isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Find existing invitation (any status except used — D-09 allows resend for expired)
  const [existingInvitation] = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, workspace.id),
        isNull(workspaceInvitations.usedAt),
      ),
    )
    .limit(1);

  if (!existingInvitation) {
    return c.json({ message: "Invitation not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Hard-delete the old invitation
  await db
    .delete(workspaceInvitations)
    .where(eq(workspaceInvitations.id, invitationId));

  // Generate new token
  const rawToken = crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [newInvitation] = await db
    .insert(workspaceInvitations)
    .values({
      workspaceId: workspace.id,
      inviterUserId: existingInvitation.inviterUserId,
      email: existingInvitation.email,
      role: existingInvitation.role,
      tokenHash,
      expiresAt,
    })
    .returning();

  // Get inviter name for email
  const [inviter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, existingInvitation.inviterUserId))
    .limit(1);

  const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") || "Someone";

  // Send invitation email
  const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";
  await sendEmail(c.env, {
    to: { email: existingInvitation.email },
    subject: `You've been invited to join ${workspace.name} on Tracky`,
    htmlContent: buildInvitationEmail({
      inviteUrl: `${frontendUrl}/invite?token=${rawToken}`,
      workspaceName: workspace.name,
      inviterName,
      role: existingInvitation.role,
    }),
  }).catch((err) => {
    c.var.logger?.error({ err, email: existingInvitation.email }, "Failed to send invitation email (resend)");
  });

  return c.json({
    id: newInvitation.id,
    email: newInvitation.email,
    role: newInvitation.role,
    inviterName,
    expiresAt: newInvitation.expiresAt instanceof Date ? newInvitation.expiresAt.getTime() : Number(newInvitation.expiresAt),
    createdAt: newInvitation.createdAt instanceof Date ? newInvitation.createdAt.getTime() : Number(newInvitation.createdAt),
  }, HttpStatusCodes.CREATED);
};

// Update workspace member role
export const updateWorkspaceMemberRole: AppRouteHandler<UpdateWorkspaceMemberRoleRoute> = async (c) => {
  const { slug, userId: targetUserId } = c.req.valid("param");
  const { role: newRole } = c.req.valid("json");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Admin only
  if (!isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Find target member
  const [targetMember] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!targetMember) {
    return c.json({ message: "Member not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Prevent changing role of owner
  if (targetMember.role === "owner") {
    return c.json(
      { message: "Cannot change the role of the workspace owner" },
      HttpStatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  // Update role in DB
  const [updated] = await db
    .update(workspaceMembers)
    .set({ role: newRole })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId),
      ),
    )
    .returning();

  // Sync users.role
  const userRole = newRole === "admin" ? "workspace_admin" : "member";
  await db
    .update(users)
    .set({ role: userRole, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  // Email notification (ADMIN-02) — notify target user about role change
  {
    const actorId = c.get("userId");
    const [actor] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);
    const actorName = [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || "An admin";

    const workspaceSlug = workspace.slug;
    const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

    await dispatchNotificationEmail({
      db,
      env: c.env,
      type: "role_changed",
      actorId,
      recipientId: targetUserId,
      payload: {
        actorName,
        workspaceName: workspace.name,
        workspaceSlug,
        newRole,
        ctaUrl: `${frontendUrl}/settings`,
        preferencesUrl: `${frontendUrl}/settings#notifications`,
      },
    }).catch((err) => {
      c.var.logger?.error({ err, recipientId: targetUserId }, "Failed to send role change notification email");
    });
  }

  // Log audit event
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: c.get("userId"),
    action: "member_role_updated",
    resourceType: "workspace",
    workspaceId: workspace.id,
    resourceId: targetUserId,
    metadata: { newRole, previousRole: targetMember.role },
    ipAddress,
    userAgent,
  });

  return c.json({
    id: updated.id,
    userId: targetUserId,
    role: updated.role,
  }, HttpStatusCodes.OK);
};

// Remove workspace member
export const removeWorkspaceMember: AppRouteHandler<RemoveWorkspaceMemberRoute> = async (c) => {
  const { slug, userId: targetUserId } = c.req.valid("param");
  const currentUserId = c.get("userId");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Allow self-removal OR admin removing others
  const isSelfRemoval = currentUserId === targetUserId;

  if (!isSelfRemoval && !isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Find target member
  const [targetMember] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!targetMember) {
    return c.json({ message: "Member not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Hard-delete the member
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId),
      ),
    );

  // Log audit event
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: currentUserId,
    action: "member_removed",
    resourceType: "workspace",
    workspaceId: workspace.id,
    resourceId: targetUserId,
    metadata: { removedUserId: targetUserId, isSelfRemoval },
    ipAddress,
    userAgent,
  });

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

// Update workspace settings
export const updateWorkspaceSettings: AppRouteHandler<UpdateWorkspaceSettingsRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const body = c.req.valid("json");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Admin only
  if (!isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check slug uniqueness if changing
  if (body.slug && body.slug !== workspace.slug) {
    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, body.slug))
      .limit(1);
    if (existing) {
      return c.json({ message: "Slug already taken" }, HttpStatusCodes.CONFLICT);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name)
    updates.name = body.name;
  if (body.slug)
    updates.slug = body.slug;

  const [updated] = await db
    .update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, workspace.id))
    .returning({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      storageUsedBytes: workspaces.storageUsedBytes,
      storageQuotaBytes: workspaces.storageQuotaBytes,
    });

  // Log audit event
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: c.get("userId"),
    action: "workspace_settings_updated",
    resourceType: "workspace",
    workspaceId: workspace.id,
    resourceId: workspace.id,
    metadata: { changes: body },
    ipAddress,
    userAgent,
  });

  return c.json(updated, HttpStatusCodes.OK);
};

// List workspace audit logs
export const listWorkspaceAuditLogs: AppRouteHandler<ListWorkspaceAuditLogsRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const { page = 1, limit = 20 } = c.req.valid("query");
  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Verify caller belongs to this workspace
  if (!c.get("isSuperAdmin") && !isInWorkspace(c.get("workspaceId"), workspace.id)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  // Admin only
  if (!isWorkspaceAdmin(c.get("workspaceRole"), c.get("isSuperAdmin") ?? false)) {
    return c.json({ message: "Access denied - admin only" }, HttpStatusCodes.FORBIDDEN);
  }

  const offset = (page - 1) * limit;

  const [totalResult] = await db
    .select({ count: count() })
    .from(auditLogs)
    .where(eq(auditLogs.workspaceId, workspace.id));

  const logs = await db
    .select({
      id: auditLogs.id,
      actorId: auditLogs.actorId,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(eq(auditLogs.workspaceId, workspace.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    logs: logs.map(log => ({
      ...log,
      metadata: log.metadata ?? null,
      createdAt: log.createdAt.toISOString(),
      actorEmail: log.actorEmail ?? null,
    })),
    totalCount: totalResult?.count ?? 0,
    page,
    limit,
  }, HttpStatusCodes.OK);
};

// Update member billing permission
export const updateMemberBillingPermission: AppRouteHandler<UpdateMemberBillingPermissionRoute> = async (c) => {
  const { slug, userId: targetUserId } = c.req.valid("param");
  const { canManageBilling } = c.req.valid("json");
  const currentUserId = c.get("userId");

  const db = createDb(c.env);

  const workspace = await getWorkspaceBySlug(db, slug);
  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Only workspace owner can manage billing permissions
  if (workspace.ownerId !== currentUserId) {
    return c.json({ message: "Only the workspace owner can manage billing permissions" }, HttpStatusCodes.FORBIDDEN);
  }

  // Verify target user is a workspace member
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!membership) {
    return c.json({ message: "Member not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Update billing permission
  await db
    .update(workspaceMembers)
    .set({ canManageBilling })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId),
      ),
    );

  // Log audit event
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: currentUserId,
    action: canManageBilling ? "billing_permission_granted" : "billing_permission_revoked",
    resourceType: "workspace",
    workspaceId: workspace.id,
    resourceId: targetUserId,
    metadata: { targetUserId, canManageBilling },
    ipAddress,
    userAgent,
  });

  return c.json({ userId: targetUserId, canManageBilling }, HttpStatusCodes.OK);
};
