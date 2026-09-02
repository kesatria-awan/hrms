import { and, asc, count, eq, isNull } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { PlanType } from "@/api/lib/plan-limits";
import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  boardMembers,
  boards,
  columns,
  DEFAULT_COLUMNS,
  users,
  workspaces,
} from "@/api/db/schema";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";
import { getBoardAccess, hasPermission } from "@/api/lib/permissions";
import { getPlanLimits } from "@/api/lib/plan-limits";

import type {
  AddBoardMemberRoute,
  CreateBoardRoute,
  DeleteBoardRoute,
  GetBoardRoute,
  ListBoardMembersRoute,
  ListBoardsRoute,
  RemoveBoardMemberRoute,
  UpdateBoardMemberRoleRoute,
  UpdateBoardRoute,
} from "./board.routes";

export const listBoards: AppRouteHandler<ListBoardsRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);
  const workspaceRole = c.get("workspaceRole") ?? "user";
  const isHighPrivilege = hasPermission(workspaceRole, "see_all_boards_and_users");

  let result;

  if (isHighPrivilege) {
    // Workspace owner/admin can see ALL boards in the workspace
    result = await db
      .select()
      .from(boards)
      .where(
        and(
          eq(boards.workspaceId, workspaceId),
          isNull(boards.deletedAt),
        ),
      )
      .orderBy(asc(boards.position));
  }
  else {
    // Regular users only see boards they are members of
    const userBoards = await db
      .select({
        board: boards,
      })
      .from(boards)
      .innerJoin(boardMembers, eq(boards.id, boardMembers.boardId))
      .where(
        and(
          eq(boards.workspaceId, workspaceId),
          isNull(boards.deletedAt),
          eq(boardMembers.userId, userId),
        ),
      )
      .orderBy(asc(boards.position));

    // Deduplicate boards (user might have multiple memberships)
    result = [...new Map(userBoards.map(b => [b.board.id, b.board])).values()];
  }

  return c.json(result, HttpStatusCodes.OK);
};

export const getBoard: AppRouteHandler<GetBoardRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const access = await getBoardAccess({
    db,
    boardId: id,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get board with columns
  const [board] = await db
    .select()
    .from(boards)
    .where(
      and(
        eq(boards.id, id),
        eq(boards.workspaceId, workspaceId),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);

  if (!board) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  const boardColumns = await db
    .select()
    .from(columns)
    .where(eq(columns.boardId, id))
    .orderBy(asc(columns.position));

  return c.json(
    {
      ...board,
      columns: boardColumns.map(col => ({
        id: col.id,
        name: col.name,
        position: col.position,
        isDefault: col.isDefault,
        isDoneColumn: col.isDoneColumn,
      })),
      access: {
        canView: access.canView,
        canEdit: access.canEdit,
        canDelete: access.canDelete,
        canEditTasks: access.canEditTasks,
        canDeleteTasks: access.canDeleteTasks,
        canManageMembers: access.canManageMembers,
        canViewMembers: access.canViewMembers,
        canComment: access.canComment,
        canUpload: access.canUpload,
        role: access.role,
      },
    },
    HttpStatusCodes.OK,
  );
};

export const createBoard: AppRouteHandler<CreateBoardRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const body = c.req.valid("json");
  const db = createDb(c.env);

  // Get workspace plan for limit check
  const [workspace] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const plan = (workspace?.plan ?? "free") as PlanType;
  const { maxBoards } = getPlanLimits(plan);

  // Check board limit (skip for unlimited plans)
  if (maxBoards !== Infinity) {
    const [boardCount] = await db
      .select({ count: count() })
      .from(boards)
      .where(
        and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)),
      );

    if (boardCount.count >= maxBoards) {
      return c.json(
        { message: `Board limit reached (Free plan: max ${maxBoards} boards). Upgrade to Pro for unlimited boards.` },
        HttpStatusCodes.UNPROCESSABLE_ENTITY,
      );
    }
  }

  // Get next position
  const [lastBoard] = await db
    .select({ position: boards.position })
    .from(boards)
    .where(eq(boards.workspaceId, workspaceId))
    .orderBy(asc(boards.position))
    .limit(1);

  const nextPosition = (lastBoard?.position ?? -1) + 1;

  // Create board
  const [board] = await db
    .insert(boards)
    .values({
      workspaceId,
      name: body.name,
      description: body.description,
      color: body.color,
      visibility: "private",
      autoArchiveDoneDays: body.autoArchiveDoneDays,
      createdById: userId,
      position: nextPosition,
    })
    .returning();

  // Add creator as board admin
  await db.insert(boardMembers).values({
    boardId: board.id,
    userId,
    role: "admin",
  });

  // Create default columns
  const createdColumns = await db
    .insert(columns)
    .values(
      DEFAULT_COLUMNS.map(col => ({
        boardId: board.id,
        ...col,
      })),
    )
    .returning();

  c.var.logger?.info({ boardId: board.id, userId }, "Board created");

  return c.json(
    {
      ...board,
      columns: createdColumns.map(col => ({
        id: col.id,
        name: col.name,
        position: col.position,
        isDefault: col.isDefault,
        isDoneColumn: col.isDoneColumn,
      })),
    },
    HttpStatusCodes.CREATED,
  );
};

export const updateBoard: AppRouteHandler<UpdateBoardRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const access = await getBoardAccess({
    db,
    boardId: id,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEdit) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  const [updated] = await db
    .update(boards)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(boards.id, id))
    .returning();

  c.var.logger?.info({ boardId: id, userId }, "Board updated");

  return c.json(updated, HttpStatusCodes.OK);
};

export const deleteBoard: AppRouteHandler<DeleteBoardRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const access = await getBoardAccess({
    db,
    boardId: id,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canDelete) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Soft delete
  await db
    .update(boards)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(boards.id, id));

  c.var.logger?.info({ boardId: id, userId }, "Board deleted");

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

export const addBoardMember: AppRouteHandler<AddBoardMemberRoute> = async (c) => {
  const currentUserId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");
  const { userId: targetUserId, role } = c.req.valid("json");

  if (!currentUserId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const access = await getBoardAccess({
    db,
    boardId: id,
    userId: currentUserId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canManageMembers) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check if user is already a member
  const [existing] = await db
    .select()
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, id),
        eq(boardMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json(
      { message: "User is already a member" },
      HttpStatusCodes.CONFLICT,
    );
  }

  const [member] = await db
    .insert(boardMembers)
    .values({
      boardId: id,
      userId: targetUserId,
      role,
    })
    .returning();

  c.var.logger?.info(
    { boardId: id, targetUserId, role, addedBy: currentUserId },
    "Board member added",
  );

  // Email notification (ADMIN-03) — notify user they were added to a board
  {
    const [actor] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);
    const actorName = [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || "An admin";

    const [boardRow] = await db
      .select({ name: boards.name })
      .from(boards)
      .where(eq(boards.id, id))
      .limit(1);

    const [ws] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const workspaceSlug = ws?.slug ?? workspaceId;

    const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

    await dispatchNotificationEmail({
      db,
      env: c.env,
      type: "board_membership_changed",
      actorId: currentUserId,
      recipientId: targetUserId,
      payload: {
        actorName,
        boardName: boardRow?.name,
        boardId: id,
        workspaceSlug,
        changeType: "added",
        ctaUrl: `${frontendUrl}/boards/${id}`,
        preferencesUrl: `${frontendUrl}/settings#notifications`,
      },
    }).catch(() => {});
  }

  return c.json(member, HttpStatusCodes.CREATED);
};

export const removeBoardMember: AppRouteHandler<RemoveBoardMemberRoute> = async (c) => {
  const currentUserId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id, userId: targetUserId } = c.req.valid("param");

  if (!currentUserId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const access = await getBoardAccess({
    db,
    boardId: id,
    userId: currentUserId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canManageMembers) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check if target user is a member
  const [existing] = await db
    .select()
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, id),
        eq(boardMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!existing) {
    return c.json(
      { message: "Board or member not found" },
      HttpStatusCodes.NOT_FOUND,
    );
  }

  // Prevent removing the last admin
  if (existing.role === "admin") {
    const [adminCount] = await db
      .select({ count: count() })
      .from(boardMembers)
      .where(
        and(eq(boardMembers.boardId, id), eq(boardMembers.role, "admin")),
      );

    if (adminCount.count <= 1) {
      return c.json(
        { message: "Cannot remove the last admin" },
        HttpStatusCodes.FORBIDDEN,
      );
    }
  }

  await db
    .delete(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, id),
        eq(boardMembers.userId, targetUserId),
      ),
    );

  c.var.logger?.info(
    { boardId: id, targetUserId, removedBy: currentUserId },
    "Board member removed",
  );

  // Email notification (ADMIN-03) — notify user they were removed from a board
  {
    const [actor] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);
    const actorName = [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || "An admin";

    const [boardRow] = await db
      .select({ name: boards.name })
      .from(boards)
      .where(eq(boards.id, id))
      .limit(1);

    const [ws] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const workspaceSlug = ws?.slug ?? workspaceId;

    const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

    await dispatchNotificationEmail({
      db,
      env: c.env,
      type: "board_membership_changed",
      actorId: currentUserId,
      recipientId: targetUserId,
      payload: {
        actorName,
        boardName: boardRow?.name,
        boardId: id,
        workspaceSlug,
        changeType: "removed",
        ctaUrl: `${frontendUrl}/settings`,
        preferencesUrl: `${frontendUrl}/settings#notifications`,
      },
    }).catch(() => {});
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

export const listBoardMembers: AppRouteHandler<ListBoardMembersRoute> = async (c) => {
  const currentUserId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!currentUserId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const access = await getBoardAccess({
    db,
    boardId: id,
    userId: currentUserId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // All board members (including guests) can see the member list

  // Get all board members with user details
  const members = await db
    .select({
      id: boardMembers.id,
      boardId: boardMembers.boardId,
      userId: boardMembers.userId,
      role: boardMembers.role,
      createdAt: boardMembers.createdAt,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        imageUrl: users.imageUrl,
      },
    })
    .from(boardMembers)
    .innerJoin(users, eq(boardMembers.userId, users.id))
    .where(eq(boardMembers.boardId, id));

  return c.json({ members }, HttpStatusCodes.OK);
};

export const updateBoardMemberRole: AppRouteHandler<UpdateBoardMemberRoleRoute> = async (c) => {
  const currentUserId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id, userId: targetUserId } = c.req.valid("param");
  const { role: newRole } = c.req.valid("json");

  if (!currentUserId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const access = await getBoardAccess({
    db,
    boardId: id,
    userId: currentUserId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canManageMembers) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check if target user is a member
  const [existing] = await db
    .select()
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, id),
        eq(boardMembers.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!existing) {
    return c.json(
      { message: "Board or member not found" },
      HttpStatusCodes.NOT_FOUND,
    );
  }

  // Prevent demoting the last admin to any non-admin role
  if (existing.role === "admin" && newRole !== "admin") {
    const [adminCount] = await db
      .select({ count: count() })
      .from(boardMembers)
      .where(
        and(eq(boardMembers.boardId, id), eq(boardMembers.role, "admin")),
      );

    if (adminCount.count <= 1) {
      return c.json(
        { message: "Cannot change role - board must have at least one admin" },
        HttpStatusCodes.UNPROCESSABLE_ENTITY,
      );
    }
  }

  const [updated] = await db
    .update(boardMembers)
    .set({ role: newRole })
    .where(
      and(
        eq(boardMembers.boardId, id),
        eq(boardMembers.userId, targetUserId),
      ),
    )
    .returning();

  c.var.logger?.info(
    { boardId: id, targetUserId, newRole, updatedBy: currentUserId },
    "Board member role updated",
  );

  return c.json(updated, HttpStatusCodes.OK);
};
