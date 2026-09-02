import { applyD1Migrations, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";

import { brevoWebhookHandler } from "./brevo.handlers";
import { brevoWebhook } from "./brevo.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

function createTestRouter() {
  return createRouter().openapi(brevoWebhook, brevoWebhookHandler);
}

describe("brevo webhook handler", () => {
  let testUserId: string;
  const testEmail = "bounce-test@example.com";

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);

    const [ws] = await db
      .insert(workspaces)
      .values({
        name: "Test Workspace",
        slug: "test-workspace-brevo",
        ownerId: "user_brevo_test",
        clerkOrgId: "org_brevo_test",
        plan: "free",
        subscriptionStatus: "none",
      })
      .returning();

    const [user] = await db
      .insert(users)
      .values({
        id: "user_brevo_test",
        email: testEmail,
        workspaceId: ws.id,
        role: "workspace_admin",
        emailSuppressed: false,
      })
      .returning();

    testUserId = user.id;
  });

  it("returns 401 when no secret query param is provided", async () => {
    const router = createTestRouter();

    const response = await router.request(
      "/brevo",
      {
        method: "POST",
        body: JSON.stringify({ event: "hard_bounce", email: testEmail }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toBe("Unauthorized");
  });

  it("returns 401 when wrong secret is provided", async () => {
    const router = createTestRouter();

    const response = await router.request(
      "/brevo?secret=wrong-secret",
      {
        method: "POST",
        body: JSON.stringify({ event: "hard_bounce", email: testEmail }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toBe("Unauthorized");
  });

  it("returns 200 and sets emailSuppressed=true on hard_bounce event", async () => {
    const router = createTestRouter();

    const response = await router.request(
      "/brevo?secret=test-webhook-secret",
      {
        method: "POST",
        body: JSON.stringify({ event: "hard_bounce", email: testEmail }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);

    const db = createDb(typedEnv);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.emailSuppressed).toBe(true);
  });

  it("returns 200 and sets emailSuppressed=true on unsubscribed event", async () => {
    const db = createDb(typedEnv);
    // Reset emailSuppressed to false
    await db.update(users).set({ emailSuppressed: false }).where(eq(users.id, testUserId));

    const router = createTestRouter();

    const response = await router.request(
      "/brevo?secret=test-webhook-secret",
      {
        method: "POST",
        body: JSON.stringify({ event: "unsubscribed", email: testEmail }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.emailSuppressed).toBe(true);
  });

  it("returns 200 and does not set emailSuppressed on unknown event (delivered)", async () => {
    const db = createDb(typedEnv);
    // Ensure emailSuppressed is false
    await db.update(users).set({ emailSuppressed: false }).where(eq(users.id, testUserId));

    const router = createTestRouter();

    const response = await router.request(
      "/brevo?secret=test-webhook-secret",
      {
        method: "POST",
        body: JSON.stringify({ event: "delivered", email: testEmail }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.emailSuppressed).toBe(false);
  });

  it("returns 200 (graceful no-op) for hard_bounce with non-existent email", async () => {
    const router = createTestRouter();

    const response = await router.request(
      "/brevo?secret=test-webhook-secret",
      {
        method: "POST",
        body: JSON.stringify({ event: "hard_bounce", email: "nonexistent@example.com" }),
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);
  });
});
