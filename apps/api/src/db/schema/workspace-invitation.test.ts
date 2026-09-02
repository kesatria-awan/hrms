import { describe, expect, it } from "vitest";

// Tests will import from the module after it's created.
// These tests run in RED state initially (module doesn't exist).
import {
  insertWorkspaceInvitationSchema,
  invitationRoles,
  selectWorkspaceInvitationSchema,
  workspaceInvitations,
} from "./workspace-invitation";

describe("workspaceInvitations schema", () => {
  it("has all required columns: id, workspaceId, inviterUserId, email, role, tokenHash, expiresAt, usedAt, revokedAt, createdAt", () => {
    const columns = Object.keys(workspaceInvitations);
    expect(columns).toContain("id");
    expect(columns).toContain("workspaceId");
    expect(columns).toContain("inviterUserId");
    expect(columns).toContain("email");
    expect(columns).toContain("role");
    expect(columns).toContain("tokenHash");
    expect(columns).toContain("expiresAt");
    expect(columns).toContain("usedAt");
    expect(columns).toContain("revokedAt");
    expect(columns).toContain("createdAt");
  });

  it("invitationRoles contains exactly [\"admin\", \"user\"] (no \"owner\")", () => {
    expect(invitationRoles).toEqual(["admin", "user"]);
    expect(invitationRoles).not.toContain("owner");
    expect(invitationRoles).toHaveLength(2);
  });

  it("selectWorkspaceInvitationSchema is a valid Zod schema", () => {
    expect(selectWorkspaceInvitationSchema).toBeDefined();
    expect(typeof selectWorkspaceInvitationSchema.parse).toBe("function");
    expect(typeof selectWorkspaceInvitationSchema.safeParse).toBe("function");
  });

  it("insertWorkspaceInvitationSchema is a valid Zod schema and omits id and createdAt", () => {
    expect(insertWorkspaceInvitationSchema).toBeDefined();
    expect(typeof insertWorkspaceInvitationSchema.parse).toBe("function");
    // id and createdAt should be omitted (not required in insert schema)
    const shape = insertWorkspaceInvitationSchema.shape;
    expect(shape).not.toHaveProperty("id");
    expect(shape).not.toHaveProperty("createdAt");
    // Required fields should be present
    expect(shape).toHaveProperty("workspaceId");
    expect(shape).toHaveProperty("email");
    expect(shape).toHaveProperty("tokenHash");
    expect(shape).toHaveProperty("expiresAt");
  });
});
