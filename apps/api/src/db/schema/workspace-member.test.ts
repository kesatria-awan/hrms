import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { users, workspaceMembers, workspaces } from "@/api/db/schema";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

describe("workspaceMembers schema", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  it("has correct columns (id, workspace_id, user_id, role, created_at)", async () => {
    const db = createDb(typedEnv);

    // Create a workspace first
    const [workspace] = await db.insert(workspaces).values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_owner",
    }).returning();

    // Create a user
    const [user] = await db.insert(users).values({
      id: "user_test_member",
      email: "test@example.com",
    }).returning();

    // Create workspace member
    const [member] = await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "admin",
    }).returning();

    expect(member).toHaveProperty("id");
    expect(member.id).toBeTruthy();
    expect(member).toHaveProperty("workspaceId", workspace.id);
    expect(member).toHaveProperty("userId", user.id);
    expect(member).toHaveProperty("role", "admin");
    expect(member).toHaveProperty("createdAt");
    expect(member.createdAt).toBeInstanceOf(Date);

    // Cleanup - delete in order to respect foreign keys
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, member.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
  });

  it("prevents duplicate (workspace_id, user_id) entries via unique index", async () => {
    const db = createDb(typedEnv);

    // Create workspace and user
    const [workspace] = await db.insert(workspaces).values({
      name: "Unique Test Workspace",
      slug: "unique-test-workspace",
      ownerId: "user_unique_owner",
    }).returning();

    const [user] = await db.insert(users).values({
      id: "user_unique_test",
      email: "unique@example.com",
    }).returning();

    // First insert should succeed
    const [firstMember] = await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "member",
    }).returning();

    // Second insert with same workspace_id + user_id should fail
    await expect(
      db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "admin",
      }),
    ).rejects.toThrow();

    // Cleanup
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, firstMember.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
  });

  it("cascade deletes members when workspace is deleted", async () => {
    const db = createDb(typedEnv);

    // Create workspace and user
    const [workspace] = await db.insert(workspaces).values({
      name: "Cascade Workspace Test",
      slug: "cascade-workspace-test",
      ownerId: "user_cascade_owner",
    }).returning();

    const [user] = await db.insert(users).values({
      id: "user_cascade_test",
      email: "cascade@example.com",
    }).returning();

    // Add member
    const [member] = await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "member",
    }).returning();

    // Verify member exists
    const membersBefore = await db.select().from(workspaceMembers);
    expect(membersBefore.some(m => m.id === member.id)).toBe(true);

    // Delete workspace - this should cascade delete members
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));

    // Verify member is deleted
    const membersAfter = await db.select().from(workspaceMembers);
    expect(membersAfter.some(m => m.id === member.id)).toBe(false);

    // Cleanup remaining user
    await db.delete(users).where(eq(users.id, user.id));
  });

  it("cascade deletes memberships when user is deleted", async () => {
    const db = createDb(typedEnv);

    // Create workspace and user
    const [workspace] = await db.insert(workspaces).values({
      name: "User Cascade Test",
      slug: "user-cascade-test",
      ownerId: "user_cascade_owner_2",
    }).returning();

    const [user] = await db.insert(users).values({
      id: "user_to_delete",
      email: "to-delete@example.com",
    }).returning();

    // Add member
    const [member] = await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "admin",
    }).returning();

    // Verify member exists
    const membersBefore = await db.select().from(workspaceMembers);
    expect(membersBefore.some(m => m.id === member.id)).toBe(true);

    // Delete user - this should cascade delete memberships
    await db.delete(users).where(eq(users.id, user.id));

    // Verify membership is deleted
    const membersAfter = await db.select().from(workspaceMembers);
    expect(membersAfter.some(m => m.id === member.id)).toBe(false);

    // Cleanup remaining workspace
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
  });

  it("supports both admin and member roles", async () => {
    const db = createDb(typedEnv);

    // Create workspace
    const [workspace] = await db.insert(workspaces).values({
      name: "Roles Test Workspace",
      slug: "roles-test-workspace",
      ownerId: "user_roles_owner",
    }).returning();

    // Create users
    const [adminUser] = await db.insert(users).values({
      id: "user_admin_role",
      email: "admin-role@example.com",
    }).returning();

    const [memberUser] = await db.insert(users).values({
      id: "user_member_role",
      email: "member-role@example.com",
    }).returning();

    // Add admin member
    const [admin] = await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: adminUser.id,
      role: "admin",
    }).returning();

    // Add regular member
    const [member] = await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: memberUser.id,
      role: "member",
    }).returning();

    expect(admin.role).toBe("admin");
    expect(member.role).toBe("member");

    // Cleanup - delete in order (members first due to cascade, but explicit is cleaner)
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, admin.id));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, member.id));
    await db.delete(users).where(eq(users.id, adminUser.id));
    await db.delete(users).where(eq(users.id, memberUser.id));
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
  });
});
