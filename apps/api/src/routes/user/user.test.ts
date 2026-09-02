import {
  applyD1Migrations,
  env,
} from "cloudflare:test";
import { testClient } from "hono/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { users, workspaces } from "@/api/db/schema";
import createApp from "@/api/lib/create-app";

import router from "./user.index";

const client = testClient(createApp().route("/users", router), env);
const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

describe("users routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    // Clean up tables before each test to ensure isolation
    // Delete users first due to foreign key constraint
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("get /users returns 404 when no users found", async () => {
    const response = await client.api.users.$get();

    expect(response.status).toBe(404);
    if (response.status === 404) {
      const json = await response.json();
      expect(json.message).toBe("Users not found");
    }
  });

  it("get /users lists all users", async () => {
    const db = createDb(typedEnv);

    // First create a workspace
    const [workspace] = await db.insert(workspaces).values({
      name: "Test Workspace",
      slug: "test-workspace",
      ownerId: "user_test123",
    }).returning();

    // Insert a test user using Drizzle ORM (now with Clerk-style ID)
    const testUser = {
      id: "user_test123",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      workspaceId: workspace.id,
      role: "workspace_admin" as const,
    };

    await db.insert(users).values(testUser);

    const response = await client.api.users.$get();

    expect(response.status).toBe(200);
    if (response.status === 200) {
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBeGreaterThan(0);
      expect(json[0]).toHaveProperty("id");
      expect(json[0]).toHaveProperty("email");
      expect(json[0]).toHaveProperty("firstName");
      expect(json[0]).toHaveProperty("lastName");
      expect(json[0]).toHaveProperty("role");
      expect(json[0]).toHaveProperty("workspaceId");
      expect(json[0].email).toBe(testUser.email);
      expect(json[0].firstName).toBe(testUser.firstName);
      expect(json[0].role).toBe(testUser.role);
    }
  });
});
