import { applyD1Migrations, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { auditLogs, users, workspaces } from "@/api/db/schema";
import createRouter from "@/api/lib/create-router";
import { mockClerkAuth } from "@/api/test-utils/mock-auth";

import * as handlers from "./billing.handlers";
import * as routes from "./billing.routes";

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Mock CHIP client
vi.mock("@/api/lib/chip-client", () => ({
  createChipClient: vi.fn().mockResolvedValue({
    id: "chip_client_123",
    email: "admin@example.com",
    full_name: "Test Workspace",
  }),
  createChipPurchase: vi.fn().mockResolvedValue({
    id: "chip_purchase_123",
    status: "created",
    checkout_url: "https://gate.chip-in.asia/checkout/chip_purchase_123",
    client_id: "chip_client_123",
    is_recurring_token: true,
    reference: "workspace-id",
  }),
}));

function createTestRouter(mockAuth: Parameters<typeof mockClerkAuth>[0]) {
  return createRouter()
    .use(mockClerkAuth(mockAuth))
    .openapi(routes.createCheckout, handlers.createCheckoutHandler)
    .openapi(routes.cancelSubscription, handlers.cancelSubscriptionHandler)
    .openapi(routes.getBillingStatus, handlers.getBillingStatusHandler);
}

describe("billing routes", () => {
  let workspace: { id: string; slug: string };

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
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

    await db.insert(users).values({
      id: "user_member",
      email: "member@example.com",
      workspaceId: workspace.id,
      role: "member",
    });
  });

  describe("post /workspaces/:slug/billing/checkout", () => {
    it("creates checkout session for free plan workspace", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/checkout`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.checkoutUrl).toContain("chip-in.asia");
      expect(data.purchaseId).toBe("chip_purchase_123");
    });

    it("saves chipClientId on first checkout", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      await router.request(
        `/workspaces/${workspace.slug}/billing/checkout`,
        { method: "POST" },
        typedEnv,
      );

      const db = createDb(typedEnv);
      const [updated] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id))
        .limit(1);

      expect(updated.chipClientId).toBe("chip_client_123");
    });

    it("returns 400 if workspace is already on active Pro plan", async () => {
      const db = createDb(typedEnv);
      await db
        .update(workspaces)
        .set({ plan: "pro", subscriptionStatus: "active" })
        .where(eq(workspaces.id, workspace.id));

      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/checkout`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(400);
    });

    it("returns 403 for non-admin members", async () => {
      const router = createTestRouter({
        userId: "user_member",
        userEmail: "member@example.com",
        userRole: "member",
        workspaceId: workspace.id,
        workspaceRole: "user",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/checkout`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });

    it("allows checkout for past_due workspace", async () => {
      const db = createDb(typedEnv);
      await db
        .update(workspaces)
        .set({ plan: "free", subscriptionStatus: "past_due" })
        .where(eq(workspaces.id, workspace.id));

      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/checkout`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(201);
    });
  });

  describe("post /workspaces/:slug/billing/cancel", () => {
    it("cancels active subscription", async () => {
      const db = createDb(typedEnv);
      const now = new Date();
      const billingEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await db
        .update(workspaces)
        .set({
          plan: "pro",
          subscriptionStatus: "active",
          billingPeriodStart: now,
          billingPeriodEnd: billingEnd,
        })
        .where(eq(workspaces.id, workspace.id));

      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/cancel`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.billingPeriodEnd).toBeTruthy();

      // Verify workspace status
      const [updated] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id))
        .limit(1);

      expect(updated.subscriptionStatus).toBe("cancelling");
      expect(updated.cancelledAt).toBeTruthy();
    });

    it("returns 400 when no active subscription", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/cancel`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(400);
    });

    it("returns 403 for non-admin members", async () => {
      const router = createTestRouter({
        userId: "user_member",
        userEmail: "member@example.com",
        userRole: "member",
        workspaceId: workspace.id,
        workspaceRole: "user",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/cancel`,
        { method: "POST" },
        typedEnv,
      );

      expect(response.status).toBe(403);
    });

    it("creates audit log on cancellation", async () => {
      const db = createDb(typedEnv);
      await db
        .update(workspaces)
        .set({
          plan: "pro",
          subscriptionStatus: "active",
          billingPeriodStart: new Date(),
          billingPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .where(eq(workspaces.id, workspace.id));

      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      await router.request(
        `/workspaces/${workspace.slug}/billing/cancel`,
        { method: "POST" },
        typedEnv,
      );

      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "subscription_cancelled"));

      expect(logs).toHaveLength(1);
      expect(logs[0].actorId).toBe("user_admin");
      expect(logs[0].resourceType).toBe("billing");
    });
  });

  describe("get /workspaces/:slug/billing/status", () => {
    it("returns billing status for workspace", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/${workspace.slug}/billing/status`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.subscriptionStatus).toBe("none");
      expect(data.plan).toBe("free");
      expect(data.billingPeriodStart).toBeNull();
      expect(data.billingPeriodEnd).toBeNull();
      expect(data.cancelledAt).toBeNull();
    });

    it("returns 404 for non-existent workspace", async () => {
      const router = createTestRouter({
        userId: "user_admin",
        userEmail: "admin@example.com",
        userRole: "workspace_admin",
        workspaceId: workspace.id,
        workspaceRole: "owner",
      });

      const response = await router.request(
        `/workspaces/non-existent/billing/status`,
        { method: "GET" },
        typedEnv,
      );

      expect(response.status).toBe(404);
    });
  });
});
