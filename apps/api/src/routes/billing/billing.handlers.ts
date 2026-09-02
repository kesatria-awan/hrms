import { and, eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { workspaceMembers, workspaces } from "@/api/db/schema";
import { getClientInfo, logAdminAction } from "@/api/lib/audit-logger";
import { createChipClient, createChipPurchase } from "@/api/lib/chip-client";
import { PLAN_PRICING } from "@/api/lib/plan-limits";

import type { CancelSubscriptionRoute, CreateCheckoutRoute, GetBillingStatusRoute } from "./billing.routes";

export const createCheckoutHandler: AppRouteHandler<CreateCheckoutRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const db = createDb(c.env);
  const userId = c.get("userId");

  // Get workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check billing permission: owner always allowed, or canManageBilling flag
  const isOwner = workspace.ownerId === userId;
  if (!isOwner) {
    const [membership] = await db
      .select({ canManageBilling: workspaceMembers.canManageBilling })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)))
      .limit(1);
    if (!membership?.canManageBilling) {
      return c.json({ message: "Only users with billing permission can manage billing" }, HttpStatusCodes.FORBIDDEN);
    }
  }

  // Only allow checkout for free plan or past_due
  if (workspace.plan === "pro" && workspace.subscriptionStatus === "active") {
    return c.json({ message: "Workspace is already on Pro plan" }, HttpStatusCodes.BAD_REQUEST);
  }

  if (workspace.subscriptionStatus === "cancelling") {
    return c.json({ message: "Subscription is pending cancellation, wait for period to end" }, HttpStatusCodes.BAD_REQUEST);
  }

  const userEmail = c.get("userEmail");
  const frontendUrl = c.env.FRONTEND_URL || "http://localhost:5173";
  // Use FRONTEND_URL for callback since API is served from same domain via proxy
  const callbackBase = c.env.FRONTEND_URL || new URL(c.req.url).origin;

  try {
    // Create CHIP client if needed
    let chipClientId = workspace.chipClientId;
    if (!chipClientId) {
      const chipClient = await createChipClient(
        c.env.CHIP_API_KEY,
        userEmail,
        workspace.name,
      );
      chipClientId = chipClient.id;

      await db
        .update(workspaces)
        .set({ chipClientId })
        .where(eq(workspaces.id, workspace.id));
    }

    // Create CHIP purchase
    const callbackUrl = `${callbackBase}/api/webhooks/chip`;
    const purchase = await createChipPurchase({
      apiKey: c.env.CHIP_API_KEY,
      brandId: c.env.CHIP_BRAND_ID,
      amount: PLAN_PRICING.pro.monthlyPriceCents,
      currency: PLAN_PRICING.pro.currency,
      productName: PLAN_PRICING.pro.productName,
      clientId: chipClientId,
      reference: workspace.id,
      successRedirect: `${frontendUrl}/settings?billing=success`,
      failureRedirect: `${frontendUrl}/settings?billing=failed`,
      cancelRedirect: `${frontendUrl}/settings?billing=cancelled`,
      callbackUrl,
    });

    return c.json(
      {
        checkoutUrl: purchase.checkout_url,
        purchaseId: purchase.id,
      },
      HttpStatusCodes.CREATED,
    );
  }
  catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    c.get("logger")?.error?.({ err: message }, "CHIP checkout creation failed");
    return c.json(
      { message: "Failed to create checkout session" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
    );
  }
};

export const cancelSubscriptionHandler: AppRouteHandler<CancelSubscriptionRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const db = createDb(c.env);
  const userId = c.get("userId");

  // Get workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check billing permission: owner always allowed, or canManageBilling flag
  const isOwner = workspace.ownerId === userId;
  if (!isOwner) {
    const [membership] = await db
      .select({ canManageBilling: workspaceMembers.canManageBilling })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)))
      .limit(1);
    if (!membership?.canManageBilling) {
      return c.json({ message: "Only users with billing permission can manage billing" }, HttpStatusCodes.FORBIDDEN);
    }
  }

  if (workspace.subscriptionStatus !== "active") {
    return c.json({ message: "No active subscription to cancel" }, HttpStatusCodes.BAD_REQUEST);
  }

  const now = new Date();

  await db
    .update(workspaces)
    .set({
      subscriptionStatus: "cancelling",
      cancelledAt: now,
      updatedAt: now,
    })
    .where(eq(workspaces.id, workspace.id));

  // Log audit event
  const { ipAddress, userAgent } = getClientInfo(c);
  await logAdminAction({
    db,
    actorId: userId,
    action: "subscription_cancelled",
    resourceType: "billing",
    resourceId: workspace.id,
    workspaceId: workspace.id,
    metadata: {
      billingPeriodEnd: workspace.billingPeriodEnd?.getTime() ?? null,
    },
    ipAddress,
    userAgent,
  });

  return c.json(
    {
      message: "Subscription cancelled. Pro features available until billing period ends.",
      billingPeriodEnd: workspace.billingPeriodEnd?.getTime() ?? null,
    },
    HttpStatusCodes.OK,
  );
};

export const getBillingStatusHandler: AppRouteHandler<GetBillingStatusRoute> = async (c) => {
  const { slug } = c.req.valid("param");
  const db = createDb(c.env);

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.NOT_FOUND);
  }

  return c.json(
    {
      subscriptionStatus: workspace.subscriptionStatus,
      plan: workspace.plan,
      billingPeriodStart: workspace.billingPeriodStart?.getTime() ?? null,
      billingPeriodEnd: workspace.billingPeriodEnd?.getTime() ?? null,
      cancelledAt: workspace.cancelledAt?.getTime() ?? null,
    },
    HttpStatusCodes.OK,
  );
};
