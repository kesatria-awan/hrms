import { applyD1Migrations, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { auditLogs, users, workspaces } from "@/api/db/schema";
import { verifyChipSignature } from "@/api/lib/chip-client";
import createRouter from "@/api/lib/create-router";

import { chipWebhookHandler } from "./chip.handlers";
import { chipWebhook } from "./chip.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Mock CHIP client functions
vi.mock("@/api/lib/chip-client", () => ({
  getChipPublicKey: vi.fn().mockResolvedValue("mock-public-key"),
  verifyChipSignature: vi.fn().mockResolvedValue(true),
}));

function createTestRouter() {
  return createRouter().openapi(chipWebhook, chipWebhookHandler);
}

describe("chip webhook handler", () => {
  let workspace: { id: string; slug: string };

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mock to return true by default
    vi.mocked(verifyChipSignature).mockResolvedValue(true);

    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);

    const [ws] = await db
      .insert(workspaces)
      .values({
        name: "Test Workspace",
        slug: "test-workspace",
        ownerId: "user_admin",
        clerkOrgId: "org_test123",
        plan: "free",
        subscriptionStatus: "none",
      })
      .returning();
    workspace = ws;

    await db.insert(users).values({
      id: "user_admin",
      email: "admin@example.com",
      workspaceId: workspace.id,
      role: "workspace_admin",
    });
  });

  it("upgrades workspace to Pro on purchase.paid (initial)", async () => {
    const router = createTestRouter();
    const payload = {
      id: "purchase_123",
      status: "paid",
      reference: workspace.id,
      is_recurring_token: true,
      event_type: "purchase.paid",
    };

    const response = await router.request(
      "/chip",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: new Headers({
          "Content-Type": "application/json",
          "X-Signature": "valid-signature",
        }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);

    const db = createDb(typedEnv);
    const [updated] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id))
      .limit(1);

    expect(updated.plan).toBe("pro");
    expect(updated.subscriptionStatus).toBe("active");
    expect(updated.chipPurchaseToken).toBe("purchase_123");
    expect(updated.billingPeriodStart).toBeTruthy();
    expect(updated.billingPeriodEnd).toBeTruthy();
    expect(updated.storageQuotaBytes).toBe(10_737_418_240); // 10GB
  });

  it("extends billing period on renewal purchase.paid", async () => {
    const db = createDb(typedEnv);
    // Use round seconds (SQLite stores integer timestamps without ms)
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const billingEnd = new Date(now.getTime() + 1000);

    await db
      .update(workspaces)
      .set({
        plan: "pro",
        subscriptionStatus: "active",
        chipPurchaseToken: "purchase_old",
        billingPeriodStart: now,
        billingPeriodEnd: billingEnd,
      })
      .where(eq(workspaces.id, workspace.id));

    const router = createTestRouter();
    const payload = {
      id: "purchase_renewal",
      status: "paid",
      reference: workspace.id,
      is_recurring_token: true,
      event_type: "purchase.paid",
    };

    const response = await router.request(
      "/chip",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: new Headers({
          "Content-Type": "application/json",
          "X-Signature": "valid-signature",
        }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id))
      .limit(1);

    // Billing period should be extended by 30 days from the old end
    expect(updated.billingPeriodStart!.getTime()).toBe(billingEnd.getTime());
    const expectedEnd = billingEnd.getTime() + 30 * 24 * 60 * 60 * 1000;
    expect(updated.billingPeriodEnd!.getTime()).toBe(expectedEnd);

    // Check audit log
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "subscription_renewed"));
    expect(logs).toHaveLength(1);
  });

  it("downgrades to Free on purchase.payment_failure", async () => {
    const db = createDb(typedEnv);
    await db
      .update(workspaces)
      .set({
        plan: "pro",
        subscriptionStatus: "active",
        chipPurchaseToken: "purchase_old",
        storageQuotaBytes: 10_737_418_240,
      })
      .where(eq(workspaces.id, workspace.id));

    const router = createTestRouter();
    const payload = {
      id: "purchase_failed",
      status: "error",
      reference: workspace.id,
      is_recurring_token: false,
      event_type: "purchase.payment_failure",
    };

    const response = await router.request(
      "/chip",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: new Headers({
          "Content-Type": "application/json",
          "X-Signature": "valid-signature",
        }),
      },
      typedEnv,
    );

    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id))
      .limit(1);

    expect(updated.plan).toBe("free");
    expect(updated.subscriptionStatus).toBe("past_due");
    expect(updated.storageQuotaBytes).toBe(524_288_000); // 500MB
    // Token kept for retry
    expect(updated.chipPurchaseToken).toBe("purchase_old");

    // Check audit log
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "subscription_payment_failed"));
    expect(logs).toHaveLength(1);
  });

  it("returns 400 on missing signature", async () => {
    const router = createTestRouter();
    const payload = {
      id: "purchase_123",
      status: "paid",
      reference: workspace.id,
      event_type: "purchase.paid",
    };

    const response = await router.request(
      "/chip",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: new Headers({
          "Content-Type": "application/json",
        }),
      },
      typedEnv,
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe("Missing signature");
  });

  it("returns 400 on invalid signature", async () => {
    vi.mocked(verifyChipSignature).mockResolvedValue(false);

    const router = createTestRouter();
    const payload = {
      id: "purchase_123",
      status: "paid",
      reference: workspace.id,
      event_type: "purchase.paid",
    };

    const response = await router.request(
      "/chip",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: new Headers({
          "Content-Type": "application/json",
          "X-Signature": "invalid-signature",
        }),
      },
      typedEnv,
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe("Invalid signature");
  });

  it("creates subscription_created audit log on initial payment", async () => {
    const router = createTestRouter();
    const payload = {
      id: "purchase_123",
      status: "paid",
      reference: workspace.id,
      is_recurring_token: true,
      event_type: "purchase.paid",
    };

    await router.request(
      "/chip",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: new Headers({
          "Content-Type": "application/json",
          "X-Signature": "valid-signature",
        }),
      },
      typedEnv,
    );

    const db = createDb(typedEnv);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "subscription_created"));

    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe("system");
    expect(logs[0].resourceType).toBe("billing");
    expect(logs[0].workspaceId).toBe(workspace.id);
  });
});
