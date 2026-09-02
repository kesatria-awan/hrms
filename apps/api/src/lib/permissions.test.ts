import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { boardMembers, boards, users, workspaceMembers, workspaces } from "@/api/db/schema";
import { boardMemberRoles } from "@/api/db/schema/board-member";
import { workspaceMemberRoles } from "@/api/db/schema/workspace-member";

import {
  BOARD_PERMISSIONS,
  getBoardAccess,
  getWorkspaceAccess,
  hasBoardPermission,
  hasPermission,
  WORKSPACE_PERMISSIONS,
} from "./permissions";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

describe("workspace permissions", () => {
  it("only has 3 workspace roles: owner, admin, user", () => {
    expect(workspaceMemberRoles).toEqual(["owner", "admin", "user"]);
  });

  it("has exactly 14 workspace permissions", () => {
    expect(Object.keys(WORKSPACE_PERMISSIONS)).toHaveLength(14);
  });

  it("each permission only has owner, admin, user columns", () => {
    for (const [, roles] of Object.entries(WORKSPACE_PERMISSIONS)) {
      expect(Object.keys(roles).sort()).toEqual(["admin", "owner", "user"]);
    }
  });

  it("owner can delete_workspace", () => {
    expect(hasPermission("owner", "delete_workspace")).toBe(true);
  });

  it("admin cannot delete_workspace", () => {
    expect(hasPermission("admin", "delete_workspace")).toBe(false);
  });

  it("user cannot create_board", () => {
    expect(hasPermission("user", "create_board")).toBe(false);
  });

  it("owner can create_workspace_account", () => {
    expect(hasPermission("owner", "create_workspace_account")).toBe(true);
  });

  it("admin can invite_user_to_workspace", () => {
    expect(hasPermission("admin", "invite_user_to_workspace")).toBe(true);
  });

  it("user can switch_workspace", () => {
    expect(hasPermission("user", "switch_workspace")).toBe(true);
  });
});

describe("board permissions", () => {
  it("only has 3 board roles: admin, member, guest", () => {
    expect(boardMemberRoles).toEqual(["admin", "member", "guest"]);
  });

  it("has exactly 19 board permissions", () => {
    expect(Object.keys(BOARD_PERMISSIONS)).toHaveLength(19);
  });

  it("admin can delete_task", () => {
    expect(hasBoardPermission("admin", "delete_task")).toBe(true);
  });

  it("member cannot delete_task", () => {
    expect(hasBoardPermission("member", "delete_task")).toBe(false);
  });

  it("guest can view_tasks", () => {
    expect(hasBoardPermission("guest", "view_tasks")).toBe(true);
  });

  it("guest cannot create_task", () => {
    expect(hasBoardPermission("guest", "create_task")).toBe(false);
  });

  it("member can create_task", () => {
    expect(hasBoardPermission("member", "create_task")).toBe(true);
  });

  it("guest can see_board_members", () => {
    expect(hasBoardPermission("guest", "see_board_members")).toBe(true);
  });

  it("member can see_board_members", () => {
    expect(hasBoardPermission("member", "see_board_members")).toBe(true);
  });
});

describe("getBoardAccess", () => {
  let workspace: { id: string };
  let board: { id: string };

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boardMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boards);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaceMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);

    const [ws] = await db.insert(workspaces).values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_owner",
    }).returning();
    workspace = ws;

    await db.insert(users).values([
      { id: "user_owner", email: "owner@example.com", workspaceId: ws.id },
      { id: "user_admin", email: "admin@example.com", workspaceId: ws.id },
      { id: "user_regular", email: "regular@example.com", workspaceId: ws.id },
      { id: "user_guest", email: "guest@example.com", workspaceId: ws.id },
    ]);

    const [b] = await db.insert(boards).values({
      workspaceId: ws.id,
      name: "Test Board",
      color: "#3B82F6",
      visibility: "private",
      createdById: "user_owner",
      position: 0,
    }).returning();
    board = b;
  });

  it("guest gets read-only access", async () => {
    const db = createDb(typedEnv);
    await db.insert(boardMembers).values({
      boardId: board.id,
      userId: "user_guest",
      role: "guest",
    });

    const access = await getBoardAccess({
      db,
      boardId: board.id,
      userId: "user_guest",
      workspaceId: workspace.id,
      userWorkspaceRole: "user",
    });

    expect(access.canView).toBe(true);
    expect(access.canEditTasks).toBe(false);
    expect(access.canDeleteTasks).toBe(false);
    expect(access.canComment).toBe(false);
    expect(access.canUpload).toBe(false);
    expect(access.canViewMembers).toBe(true);
    expect(access.role).toBe("guest");
  });

  it("member gets task editing but not deletion access", async () => {
    const db = createDb(typedEnv);
    await db.insert(boardMembers).values({
      boardId: board.id,
      userId: "user_regular",
      role: "member",
    });

    const access = await getBoardAccess({
      db,
      boardId: board.id,
      userId: "user_regular",
      workspaceId: workspace.id,
      userWorkspaceRole: "user",
    });

    expect(access.canView).toBe(true);
    expect(access.canEditTasks).toBe(true);
    expect(access.canDeleteTasks).toBe(false);
    expect(access.canComment).toBe(true);
    expect(access.canUpload).toBe(true);
    expect(access.canViewMembers).toBe(true);
    expect(access.role).toBe("member");
  });

  it("board admin gets full access", async () => {
    const db = createDb(typedEnv);
    await db.insert(boardMembers).values({
      boardId: board.id,
      userId: "user_admin",
      role: "admin",
    });

    const access = await getBoardAccess({
      db,
      boardId: board.id,
      userId: "user_admin",
      workspaceId: workspace.id,
      userWorkspaceRole: "user",
    });

    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canEditTasks).toBe(true);
    expect(access.canDeleteTasks).toBe(true);
    expect(access.canDelete).toBe(true);
    expect(access.canManageMembers).toBe(true);
    expect(access.canViewMembers).toBe(true);
    expect(access.canComment).toBe(true);
    expect(access.canUpload).toBe(true);
    expect(access.role).toBe("admin");
  });

  it("workspace owner gets full board access regardless of board role", async () => {
    const db = createDb(typedEnv);
    // user_owner is NOT a board member, but is workspace owner
    const access = await getBoardAccess({
      db,
      boardId: board.id,
      userId: "user_owner",
      workspaceId: workspace.id,
      userWorkspaceRole: "owner",
    });

    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canEditTasks).toBe(true);
    expect(access.canDeleteTasks).toBe(true);
    expect(access.canDelete).toBe(true);
    expect(access.canManageMembers).toBe(true);
    expect(access.canViewMembers).toBe(true);
    expect(access.canComment).toBe(true);
    expect(access.canUpload).toBe(true);
  });

  it("workspace admin gets full board access regardless of board role", async () => {
    const db = createDb(typedEnv);
    const access = await getBoardAccess({
      db,
      boardId: board.id,
      userId: "user_admin",
      workspaceId: workspace.id,
      userWorkspaceRole: "admin",
    });

    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canEditTasks).toBe(true);
    expect(access.canDeleteTasks).toBe(true);
    expect(access.canDelete).toBe(true);
    expect(access.canManageMembers).toBe(true);
    expect(access.canViewMembers).toBe(true);
    expect(access.canComment).toBe(true);
    expect(access.canUpload).toBe(true);
  });
});

describe("getWorkspaceAccess", () => {
  let workspace: { id: string; name: string; slug: string };
  let adminUser: { id: string; email: string };
  let memberUser: { id: string; email: string };
  let superAdminUser: { id: string; email: string };
  let nonMemberUser: { id: string; email: string };

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);

    // Clean up
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaceMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);

    // Create test workspace
    const [ws] = await db.insert(workspaces).values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_admin",
    }).returning();
    workspace = ws;

    // Create super admin (platform-level)
    await db.insert(users).values({
      id: "user_super_admin",
      email: "super@example.com",
      isSuperAdmin: true,
    });
    superAdminUser = { id: "user_super_admin", email: "super@example.com" };

    // Create workspace admin
    await db.insert(users).values({
      id: "user_admin",
      email: "admin@example.com",
      workspaceId: workspace.id,
      role: "workspace_admin",
    });
    adminUser = { id: "user_admin", email: "admin@example.com" };

    // Create workspace member
    await db.insert(users).values({
      id: "user_member",
      email: "member@example.com",
      workspaceId: workspace.id,
      role: "member",
    });
    memberUser = { id: "user_member", email: "member@example.com" };

    // Create non-member user
    await db.insert(users).values({
      id: "user_outsider",
      email: "outsider@example.com",
    });
    nonMemberUser = { id: "user_outsider", email: "outsider@example.com" };

    // Add workspace memberships
    await db.insert(workspaceMembers).values([
      { workspaceId: workspace.id, userId: adminUser.id, role: "admin" },
      { workspaceId: workspace.id, userId: memberUser.id, role: "user" },
    ]);
  });

  it("workspace admin gets edit and manage permissions but not delete", async () => {
    const db = createDb(typedEnv);
    const access = await getWorkspaceAccess({
      db,
      workspaceId: workspace.id,
      userId: adminUser.id,
      isSuperAdmin: false,
    });

    expect(access.isMember).toBe(true);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canManageMembers).toBe(true);
    expect(access.canDelete).toBe(false);
    expect(access.role).toBe("admin");
  });

  it("workspace user gets limited permissions", async () => {
    const db = createDb(typedEnv);
    const access = await getWorkspaceAccess({
      db,
      workspaceId: workspace.id,
      userId: memberUser.id,
      isSuperAdmin: false,
    });

    expect(access.isMember).toBe(true);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.canManageMembers).toBe(false);
    expect(access.canDelete).toBe(false);
    expect(access.role).toBe("user");
  });

  it("non-member gets no access", async () => {
    const db = createDb(typedEnv);
    const access = await getWorkspaceAccess({
      db,
      workspaceId: workspace.id,
      userId: nonMemberUser.id,
      isSuperAdmin: false,
    });

    expect(access.isMember).toBe(false);
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
    expect(access.canManageMembers).toBe(false);
    expect(access.canDelete).toBe(false);
    expect(access.role).toBeNull();
  });

  it("super admin gets full access to any workspace", async () => {
    const db = createDb(typedEnv);
    const access = await getWorkspaceAccess({
      db,
      workspaceId: workspace.id,
      userId: superAdminUser.id,
      isSuperAdmin: true,
    });

    expect(access.isMember).toBe(true);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canManageMembers).toBe(true);
    expect(access.canDelete).toBe(true);
    expect(access.role).toBe("super_admin");
  });

  it("returns no access for non-existent workspace", async () => {
    const db = createDb(typedEnv);
    const access = await getWorkspaceAccess({
      db,
      workspaceId: "non-existent-workspace-id",
      userId: adminUser.id,
      isSuperAdmin: false,
    });

    expect(access.isMember).toBe(false);
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
    expect(access.canManageMembers).toBe(false);
    expect(access.canDelete).toBe(false);
    expect(access.role).toBeNull();
  });
});
