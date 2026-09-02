import { applyD1Migrations, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { notificationPreferences, users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./notification-preferences.handlers";
import * as routes from "./notification-preferences.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Create test router with mock auth
function createTestRouter(authContext: Parameters<typeof mockAuth>[0]) {
  return createRouter()
    .use(mockAuth(authContext))
    .openapi(routes.getPreferences, handlers.getPreferences)
    .openapi(routes.updatePreferences, handlers.updatePreferences);
}

describe("notification preferences routes", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // Clean up in correct order (respecting foreign keys)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(notificationPreferences);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  async function setupTestUser(db: ReturnType<typeof createDb>, userId = "user_1") {
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: userId,
      })
      .returning();

    await db.insert(users).values({
      id: userId,
      email: "user1@example.com",
      firstName: "John",
      lastName: "Doe",
      imageUrl: "https://example.com/user1.jpg",
      workspaceId: workspace.id,
      role: "workspace_admin",
    });

    return { workspace };
  }

  const defaultAuth = {
    userId: "user_1",
    userEmail: "user1@example.com",
    userRole: "workspace_admin" as const,
    workspaceId: null,
  };

  // ==================== GET /notification-preferences ====================

  // PREF-P01: GET returns defaults (upserts) when no existing row
  it("pref-p01: GET returns all-true defaults and upserts row when none exists", async () => {
    const db = createDb(typedEnv);
    await setupTestUser(db);

    const router = createTestRouter(defaultAuth);

    const response = await router.request(
      "/notification-preferences",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      taskNotifications: true,
      collaborationNotifications: true,
      adminNotifications: true,
    });

    // Verify row was upserted in DB
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, "user_1"));
    expect(row).toBeDefined();
    expect(row.taskNotifications).toBe(true);
  });

  // PREF-P02: GET returns existing preferences
  it("pref-p02: GET returns existing preferences with modified values", async () => {
    const db = createDb(typedEnv);
    await setupTestUser(db);

    // Pre-insert a row with taskNotifications=false
    await db.insert(notificationPreferences).values({
      userId: "user_1",
      taskNotifications: false,
      collaborationNotifications: true,
      adminNotifications: true,
    });

    const router = createTestRouter(defaultAuth);

    const response = await router.request(
      "/notification-preferences",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      taskNotifications: false,
      collaborationNotifications: true,
      adminNotifications: true,
    });
  });

  // PREF-P03: PUT updates all 3 booleans atomically
  it("pref-p03: PUT updates all 3 booleans atomically", async () => {
    const db = createDb(typedEnv);
    await setupTestUser(db);

    const router = createTestRouter(defaultAuth);

    const body = {
      taskNotifications: false,
      collaborationNotifications: true,
      adminNotifications: false,
    };

    const putResponse = await router.request(
      "/notification-preferences",
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      env,
    );

    expect(putResponse.status).toBe(200);
    const putJson = await putResponse.json();
    expect(putJson).toEqual(body);

    // Verify subsequent GET returns updated values
    const getResponse = await router.request(
      "/notification-preferences",
      { method: "GET" },
      env,
    );

    expect(getResponse.status).toBe(200);
    const getJson = await getResponse.json();
    expect(getJson).toEqual(body);
  });

  // PREF-P04: PUT returns 422 when missing fields
  it("pref-p04: PUT returns 422 with incomplete body (missing fields)", async () => {
    const db = createDb(typedEnv);
    await setupTestUser(db);

    const router = createTestRouter(defaultAuth);

    const response = await router.request(
      "/notification-preferences",
      {
        method: "PUT",
        body: JSON.stringify({ taskNotifications: false }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      env,
    );

    expect(response.status).toBe(422);
  });

  // PREF-P05: GET requires authentication
  it("pref-p05: GET returns 401 without auth", async () => {
    const unauthRouter = createTestRouter({
      userId: "",
      userEmail: "",
      userRole: "member" as const,
      workspaceId: null,
    });

    const response = await unauthRouter.request(
      "/notification-preferences",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(401);
  });

  // PREF-P06: PUT requires authentication
  it("pref-p06: PUT returns 401 without auth", async () => {
    const unauthRouter = createTestRouter({
      userId: "",
      userEmail: "",
      userRole: "member" as const,
      workspaceId: null,
    });

    const response = await unauthRouter.request(
      "/notification-preferences",
      {
        method: "PUT",
        body: JSON.stringify({
          taskNotifications: true,
          collaborationNotifications: true,
          adminNotifications: true,
        }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      env,
    );

    expect(response.status).toBe(401);
  });
});
