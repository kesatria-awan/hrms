import { and, count, desc, eq, gte, isNull, like, lte } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AuditAction } from "@/api/db/schema";
import type { PlanType } from "@/api/lib/plan-limits";
import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { auditActions, auditLogs, boards, tasks, users, workspaces } from "@/api/db/schema";
import { getClientInfo, logAdminAction } from "@/api/lib/audit-logger";
import { getPlanLimits } from "@/api/lib/plan-limits";

import type {
  DeleteAdminWorkspaceRoute,
  GetAdminWorkspaceRoute,
  ListAdminUsersRoute,
  ListAdminWorkspacesRoute,
  ListAuditLogsRoute,
  UpdateAdminWorkspaceRoute,
} from "./admin.routes";

export const listAdminWorkspaces: AppRouteHandler<
  ListAdminWorkspacesRoute
> = async (c) => {
  const query = c.req.valid("query");
  const db = createDb(c.env);

  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const includeDeleted = query.includeDeleted ?? false;

  // Build where clause
  const whereConditions = includeDeleted ? [] : [isNull(workspaces.deletedAt)];

  // Get workspaces
  const workspaceList = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      ownerId: workspaces.ownerId,
      clerkOrgId: workspaces.clerkOrgId,
      storageUsedBytes: workspaces.storageUsedBytes,
      storageQuotaBytes: workspaces.storageQuotaBytes,
      billingType: workspaces.billingType,
      plan: workspaces.plan,
      subscriptionStatus: workspaces.subscriptionStatus,
      billingPeriodStart: workspaces.billingPeriodStart,
      billingPeriodEnd: workspaces.billingPeriodEnd,
      cancelledAt: workspaces.cancelledAt,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
      deletedAt: workspaces.deletedAt,
    })
    .from(workspaces)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(workspaces.createdAt))
    .limit(limit)
    .offset(offset);

  // Get member counts for each workspace
  const workspacesWithCounts = await Promise.all(
    workspaceList.map(async (ws) => {
      const [memberResult] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.workspaceId, ws.id));

      return {
        ...ws,
        subscriptionStatus: ws.subscriptionStatus,
        billingPeriodStart: ws.billingPeriodStart?.getTime() ?? null,
        billingPeriodEnd: ws.billingPeriodEnd?.getTime() ?? null,
        cancelledAt: ws.cancelledAt?.getTime() ?? null,
        memberCount: memberResult?.count ?? 0,
        createdAt: ws.createdAt.getTime(),
        updatedAt: ws.updatedAt.getTime(),
        deletedAt: ws.deletedAt?.getTime() ?? null,
      };
    }),
  );

  // Get total count
  const [totalResult] = await db
    .select({ count: count() })
    .from(workspaces)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

  return c.json(
    {
      workspaces: workspacesWithCounts,
      totalCount: totalResult?.count ?? 0,
    },
    HttpStatusCodes.OK,
  );
};

export const getAdminWorkspace: AppRouteHandler<
  GetAdminWorkspaceRoute
> = async (c) => {
  const { id } = c.req.valid("param");
  const db = createDb(c.env);

  // Get workspace (including soft-deleted)
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);

  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get owner details
  const [owner] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, workspace.ownerId))
    .limit(1);

  // Get member count
  const [memberResult] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.workspaceId, workspace.id));

  // Get board count
  const [boardResult] = await db
    .select({ count: count() })
    .from(boards)
    .where(and(eq(boards.workspaceId, workspace.id), isNull(boards.deletedAt)));

  // Get task count
  const [taskResult] = await db
    .select({ count: count() })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspace.id), isNull(tasks.deletedAt)));

  return c.json(
    {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      ownerId: workspace.ownerId,
      clerkOrgId: workspace.clerkOrgId,
      storageUsedBytes: workspace.storageUsedBytes,
      storageQuotaBytes: workspace.storageQuotaBytes,
      billingType: workspace.billingType,
      plan: workspace.plan,
      subscriptionStatus: workspace.subscriptionStatus,
      billingPeriodStart: workspace.billingPeriodStart?.getTime() ?? null,
      billingPeriodEnd: workspace.billingPeriodEnd?.getTime() ?? null,
      cancelledAt: workspace.cancelledAt?.getTime() ?? null,
      memberCount: memberResult?.count ?? 0,
      boardCount: boardResult?.count ?? 0,
      taskCount: taskResult?.count ?? 0,
      owner: owner ?? null,
      createdAt: workspace.createdAt.getTime(),
      updatedAt: workspace.updatedAt.getTime(),
      deletedAt: workspace.deletedAt?.getTime() ?? null,
    },
    HttpStatusCodes.OK,
  );
};

export const updateAdminWorkspace: AppRouteHandler<
  UpdateAdminWorkspaceRoute
> = async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const db = createDb(c.env);

  // Check if any updates provided
  if (!body.name && body.storageQuotaBytes === undefined && body.billingType === undefined && body.plan === undefined) {
    return c.json(
      { message: "No updates provided" },
      HttpStatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  // Get existing workspace (excluding soft-deleted)
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, id), isNull(workspaces.deletedAt)))
    .limit(1);

  if (!existing) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Build update object
  const updates: Partial<typeof workspaces.$inferInsert> = {
    updatedAt: new Date(),
  };

  const metadata: Record<string, unknown> = {};

  if (body.name) {
    metadata.previousName = existing.name;
    metadata.newName = body.name;
    updates.name = body.name;
  }

  if (body.storageQuotaBytes !== undefined) {
    metadata.previousStorageQuota = existing.storageQuotaBytes;
    metadata.newStorageQuota = body.storageQuotaBytes;
    updates.storageQuotaBytes = body.storageQuotaBytes;
  }

  if (body.billingType !== undefined) {
    metadata.previousBillingType = existing.billingType;
    metadata.newBillingType = body.billingType;
    updates.billingType = body.billingType;
  }

  if (body.plan !== undefined) {
    metadata.previousPlan = existing.plan;
    metadata.newPlan = body.plan;
    updates.plan = body.plan;

    // Auto-update storage quota to match the new plan's limit
    if (body.storageQuotaBytes === undefined) {
      const planLimits = getPlanLimits(body.plan as PlanType);
      metadata.previousStorageQuota = existing.storageQuotaBytes;
      metadata.newStorageQuota = planLimits.storageQuotaBytes;
      updates.storageQuotaBytes = planLimits.storageQuotaBytes;
    }
  }

  // Update workspace (include deletedAt check to prevent TOCTOU race condition)
  const result = await db
    .update(workspaces)
    .set(updates)
    .where(and(eq(workspaces.id, id), isNull(workspaces.deletedAt)))
    .returning();

  // Check if update was successful (workspace may have been deleted concurrently)
  if (result.length === 0) {
    return c.json({ message: "Workspace not found or was deleted" }, HttpStatusCodes.NOT_FOUND);
  }

  const updated = result[0];

  // Get member count
  const [memberResult] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.workspaceId, updated.id));

  // Log audit action
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: userId,
    action: "workspace_updated",
    resourceType: "workspace",
    resourceId: updated.id,
    workspaceId: updated.id,
    metadata,
    ipAddress,
    userAgent,
  });

  return c.json(
    {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      ownerId: updated.ownerId,
      clerkOrgId: updated.clerkOrgId,
      storageUsedBytes: updated.storageUsedBytes,
      storageQuotaBytes: updated.storageQuotaBytes,
      billingType: updated.billingType,
      plan: updated.plan,
      subscriptionStatus: updated.subscriptionStatus,
      billingPeriodStart: updated.billingPeriodStart?.getTime() ?? null,
      billingPeriodEnd: updated.billingPeriodEnd?.getTime() ?? null,
      cancelledAt: updated.cancelledAt?.getTime() ?? null,
      memberCount: memberResult?.count ?? 0,
      createdAt: updated.createdAt.getTime(),
      updatedAt: updated.updatedAt.getTime(),
      deletedAt: updated.deletedAt?.getTime() ?? null,
    },
    HttpStatusCodes.OK,
  );
};

export const deleteAdminWorkspace: AppRouteHandler<
  DeleteAdminWorkspaceRoute
> = async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const db = createDb(c.env);

  // Get existing workspace
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check if already deleted
  if (existing.deletedAt) {
    return c.json(
      { message: "Workspace already deleted" },
      HttpStatusCodes.CONFLICT,
    );
  }

  // Soft delete
  await db
    .update(workspaces)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, id));

  // Log audit action
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: userId,
    action: "workspace_deleted",
    resourceType: "workspace",
    resourceId: id,
    workspaceId: id,
    metadata: { workspaceName: existing.name, workspaceSlug: existing.slug },
    ipAddress,
    userAgent,
  });

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

export const listAdminUsers: AppRouteHandler<ListAdminUsersRoute> = async (c) => {
  const query = c.req.valid("query");
  const db = createDb(c.env);

  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  // Build where conditions
  const whereConditions: ReturnType<typeof eq>[] = [];

  if (query.workspaceId) {
    whereConditions.push(eq(users.workspaceId, query.workspaceId));
  }

  if (query.role) {
    whereConditions.push(eq(users.role, query.role));
  }

  if (query.isSuperAdmin !== undefined) {
    whereConditions.push(eq(users.isSuperAdmin, query.isSuperAdmin));
  }

  if (query.search) {
    whereConditions.push(like(users.email, `%${query.search}%`));
  }

  // Get users with workspace info
  const userList = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      imageUrl: users.imageUrl,
      role: users.role,
      isSuperAdmin: users.isSuperAdmin,
      workspaceId: users.workspaceId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  // Get workspace info for each user
  const usersWithWorkspace = await Promise.all(
    userList.map(async (user) => {
      let workspace = null;
      if (user.workspaceId) {
        const [ws] = await db
          .select({
            id: workspaces.id,
            name: workspaces.name,
            slug: workspaces.slug,
          })
          .from(workspaces)
          .where(eq(workspaces.id, user.workspaceId))
          .limit(1);
        workspace = ws ?? null;
      }

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
        workspace,
        createdAt: user.createdAt.getTime(),
        updatedAt: user.updatedAt.getTime(),
      };
    }),
  );

  // Get total count
  const [totalResult] = await db
    .select({ count: count() })
    .from(users)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

  return c.json(
    {
      users: usersWithWorkspace,
      totalCount: totalResult?.count ?? 0,
    },
    HttpStatusCodes.OK,
  );
};

export const listAuditLogs: AppRouteHandler<ListAuditLogsRoute> = async (c) => {
  const query = c.req.valid("query");
  const db = createDb(c.env);

  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  // Build where conditions
  const whereConditions: ReturnType<typeof eq>[] = [];

  if (query.actorId) {
    whereConditions.push(eq(auditLogs.actorId, query.actorId));
  }

  if (query.action) {
    // Validate action is a valid AuditAction before using
    const isValidAction = (auditActions as readonly string[]).includes(query.action);
    if (isValidAction) {
      whereConditions.push(eq(auditLogs.action, query.action as AuditAction));
    }
    // If invalid action, silently ignore the filter (returns all logs)
  }

  if (query.workspaceId) {
    whereConditions.push(eq(auditLogs.workspaceId, query.workspaceId));
  }

  if (query.startDate) {
    whereConditions.push(gte(auditLogs.createdAt, new Date(query.startDate)));
  }

  if (query.endDate) {
    whereConditions.push(lte(auditLogs.createdAt, new Date(query.endDate)));
  }

  // Get audit logs
  const logList = await db
    .select()
    .from(auditLogs)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  // Get actor details for each log
  const logsWithActors = await Promise.all(
    logList.map(async (log) => {
      const [actor] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, log.actorId))
        .limit(1);

      return {
        id: log.id,
        actorId: log.actorId,
        actor: actor ?? null,
        workspaceId: log.workspaceId,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt.getTime(),
      };
    }),
  );

  // Get total count
  const [totalResult] = await db
    .select({ count: count() })
    .from(auditLogs)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

  return c.json(
    {
      auditLogs: logsWithActors,
      totalCount: totalResult?.count ?? 0,
    },
    HttpStatusCodes.OK,
  );
};
