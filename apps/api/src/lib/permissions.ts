import type { DrizzleD1Database } from "drizzle-orm/d1";

import { and, eq, isNull } from "drizzle-orm";

import type * as schema from "@/api/db/schema";
import type { BoardMemberRole, WorkspaceMemberRole } from "@/api/db/schema";

import {
  boardMembers,
  boards,
  workspaceMembers,
  workspaces,
} from "@/api/db/schema";

export const WORKSPACE_PERMISSIONS = {
  create_workspace_account: { owner: true, admin: false, user: false },
  promote_user: { owner: true, admin: true, user: false },
  create_board: { owner: true, admin: true, user: false },
  create_group: { owner: true, admin: true, user: false },
  manage_billing: { owner: true, admin: false, user: false },
  assign_billing_permission: { owner: true, admin: false, user: false },
  see_all_boards_and_users: { owner: true, admin: true, user: false },
  invite_user_to_workspace: { owner: true, admin: true, user: false },
  remove_user_from_workspace: { owner: true, admin: true, user: false },
  delete_workspace: { owner: true, admin: false, user: false },
  switch_workspace: { owner: true, admin: true, user: true },
  view_group: { owner: true, admin: true, user: false },
  publish_announcement: { owner: true, admin: true, user: false },
  view_dashboard: { owner: true, admin: true, user: false },
} as const;

export function hasPermission(role: WorkspaceMemberRole, permission: keyof typeof WORKSPACE_PERMISSIONS): boolean {
  return WORKSPACE_PERMISSIONS[permission][role];
}

export const BOARD_PERMISSIONS = {
  view_tasks: { admin: true, member: true, guest: true },
  see_board_members: { admin: true, member: true, guest: true },
  create_task: { admin: true, member: true, guest: false },
  edit_task: { admin: true, member: true, guest: false },
  move_task: { admin: true, member: true, guest: false },
  delete_task: { admin: true, member: false, guest: false },
  archive_task: { admin: true, member: true, guest: false },
  assign_task: { admin: true, member: true, guest: false },
  add_comment: { admin: true, member: true, guest: false },
  edit_own_comment: { admin: true, member: true, guest: false },
  delete_any_comment: { admin: true, member: false, guest: false },
  upload_attachment: { admin: true, member: true, guest: false },
  delete_any_attachment: { admin: true, member: false, guest: false },
  edit_board_settings: { admin: true, member: false, guest: false },
  delete_board: { admin: true, member: false, guest: false },
  manage_columns: { admin: true, member: false, guest: false },
  invite_board_member: { admin: true, member: false, guest: false },
  remove_board_member: { admin: true, member: false, guest: false },
  change_member_role: { admin: true, member: false, guest: false },
} as const;

export function hasBoardPermission(role: BoardMemberRole, permission: keyof typeof BOARD_PERMISSIONS): boolean {
  return BOARD_PERMISSIONS[permission][role];
}

export type WorkspaceAccess = {
  isMember: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  role: WorkspaceMemberRole | "super_admin" | null;
};

export type WorkspaceAccessParams = {
  db: DrizzleD1Database<typeof schema>;
  workspaceId: string;
  userId: string;
  isSuperAdmin: boolean;
};

/**
 * Check if a user has access to a workspace and what permissions they have.
 *
 * Workspace member roles:
 * - `owner`: Full control (edit, delete, manage members)
 * - `admin`: Full access (edit, manage members), cannot delete workspace
 * - `user`: Basic member access
 *
 * Super admins (platform-level) have full access to ALL workspaces.
 */
export async function getWorkspaceAccess(
  params: WorkspaceAccessParams,
): Promise<WorkspaceAccess> {
  const { db, workspaceId, userId, isSuperAdmin } = params;

  // Check workspace exists
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, workspaceId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);

  if (!workspace) {
    return {
      isMember: false,
      canView: false,
      canEdit: false,
      canDelete: false,
      canManageMembers: false,
      role: null,
    };
  }

  // Super admins have full access to all workspaces
  if (isSuperAdmin) {
    return {
      isMember: true,
      canView: true,
      canEdit: true,
      canDelete: true,
      canManageMembers: true,
      role: "super_admin",
    };
  }

  // Get workspace membership for the user
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return {
      isMember: false,
      canView: false,
      canEdit: false,
      canDelete: false,
      canManageMembers: false,
      role: null,
    };
  }

  const role = membership.role;

  return {
    isMember: true,
    canView: true,
    canEdit: hasPermission(role, "promote_user"),
    canDelete: hasPermission(role, "delete_workspace"),
    canManageMembers: hasPermission(role, "invite_user_to_workspace"),
    role,
  };
}

export type BoardAccess = {
  canView: boolean;
  canEdit: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canViewMembers: boolean;
  canComment: boolean;
  canUpload: boolean;
  role: BoardMemberRole | null;
  isWorkspaceMember: boolean;
};

export type BoardAccessParams = {
  db: DrizzleD1Database<typeof schema>;
  boardId: string;
  userId: string;
  workspaceId: string;
  userWorkspaceRole: WorkspaceMemberRole;
};

/**
 * Check if a user has access to a board and what permissions they have.
 *
 * Board member roles:
 * - `admin`: Full access (edit, delete, manage members)
 * - `member`: Can view, edit tasks, comment, upload
 * - `guest`: Read-only access (view tasks only)
 *
 * Workspace owner/admin have full access to ALL boards (equivalent to board admin).
 */
export async function getBoardAccess(
  params: BoardAccessParams,
): Promise<BoardAccess> {
  const { db, boardId, userId, workspaceId, userWorkspaceRole } = params;

  const noAccess: BoardAccess = {
    canView: false,
    canEdit: false,
    canEditTasks: false,
    canDeleteTasks: false,
    canDelete: false,
    canManageMembers: false,
    canViewMembers: false,
    canComment: false,
    canUpload: false,
    role: null,
    isWorkspaceMember: true,
  };

  // Get board with soft-delete check
  const [board] = await db
    .select()
    .from(boards)
    .where(
      and(
        eq(boards.id, boardId),
        eq(boards.workspaceId, workspaceId),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);

  if (!board) {
    return noAccess;
  }

  // Get board membership for the user
  const [membership] = await db
    .select()
    .from(boardMembers)
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    )
    .limit(1);

  const role = membership?.role ?? null;
  const isHighPrivilegeWorkspaceRole = hasPermission(userWorkspaceRole, "see_all_boards_and_users");

  // Workspace owner/admin get full access (equivalent to board admin)
  if (isHighPrivilegeWorkspaceRole) {
    return {
      canView: true,
      canEdit: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canDelete: true,
      canManageMembers: true,
      canViewMembers: true,
      canComment: true,
      canUpload: true,
      role,
      isWorkspaceMember: true,
    };
  }

  // Must be a board member to have any access
  if (!membership || !role) {
    return noAccess;
  }

  return {
    canView: hasBoardPermission(role, "view_tasks"),
    canEdit: hasBoardPermission(role, "edit_board_settings"),
    canEditTasks: hasBoardPermission(role, "create_task"),
    canDeleteTasks: hasBoardPermission(role, "delete_task"),
    canDelete: hasBoardPermission(role, "delete_board"),
    canManageMembers: hasBoardPermission(role, "invite_board_member"),
    canViewMembers: hasBoardPermission(role, "see_board_members"),
    canComment: hasBoardPermission(role, "add_comment"),
    canUpload: hasBoardPermission(role, "upload_attachment"),
    role,
    isWorkspaceMember: true,
  };
}

/**
 * Check if user can create boards in the workspace.
 * Only owner and admin can create boards.
 */
export function canCreateBoard(userWorkspaceRole: WorkspaceMemberRole): boolean {
  return hasPermission(userWorkspaceRole, "create_board");
}

/**
 * Check if user can modify a column.
 * Same as board edit permission.
 */
export function canEditColumn(boardAccess: BoardAccess): boolean {
  return boardAccess.canEdit;
}

/**
 * Check if user can create tasks in a board.
 * Same as board edit permission.
 */
export function canCreateTask(boardAccess: BoardAccess): boolean {
  return boardAccess.canEditTasks;
}

/**
 * Check if user can view tasks in a board.
 * Same as board view permission.
 */
export function canViewTasks(boardAccess: BoardAccess): boolean {
  return boardAccess.canView;
}
