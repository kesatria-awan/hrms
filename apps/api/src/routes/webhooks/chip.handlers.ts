import { eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { workspaces } from "@/api/db/schema";
import { logAdminAction } from "@/api/lib/audit-logger";
import { getChipPublicKey, verifyChipSignature } from "@/api/lib/chip-client";
import { getPlanLimits } from "@/api/lib/plan-limits";

import type { ChipWebhookRoute } from "./chip.routes";

type ChipWebhookPayload = {
  id: string;
  status: string;
  reference: string;
  is_recurring_token: boolean;
  recurring_token?: string;
  event_type: string;
};

export const chipWebhookHandler: AppRouteHandler<ChipWebhookRoute> = async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Signature");

  if (!signature) {
    return c.json({ message: "Missing signature" }, HttpStatusCodes.BAD_REQUEST);
  }

  // Verify signature
  try {
    const publicKey = await getChipPublicKey(c.env.CHIP_API_KEY);
    const isValid = await verifyChipSignature(publicKey, rawBody, signature);

    if (!isValid) {
      return c.json({ message: "Invalid signature" }, HttpStatusCodes.BAD_REQUEST);
    }
  }
  catch (err) {
    console.error("[CHIP Webhook] Signature verification error:", err);
    return c.json({ message: "Signature verification failed" }, HttpStatusCodes.BAD_REQUEST);
  }

  const payload = JSON.parse(rawBody) as ChipWebhookPayload;
  const db = createDb(c.env);

  // Find workspace by reference (workspace ID)
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, payload.reference))
    .limit(1);

  if (!workspace) {
    return c.json({ message: "Workspace not found" }, HttpStatusCodes.OK);
  }

  const now = new Date();

  if (payload.event_type === "purchase.paid") {
    if (workspace.subscriptionStatus === "active" && workspace.plan === "pro") {
      // Renewal payment — extend billing period
      const newStart = workspace.billingPeriodEnd ?? now;
      const newEnd = new Date(newStart.getTime() + 30 * 24 * 60 * 60 * 1000);

      await db
        .update(workspaces)
        .set({
          billingPeriodStart: newStart,
          billingPeriodEnd: newEnd,
          updatedAt: now,
        })
        .where(eq(workspaces.id, workspace.id));

      await logAdminAction({
        db,
        actorId: "system",
        action: "subscription_renewed",
        resourceType: "billing",
        resourceId: workspace.id,
        workspaceId: workspace.id,
        metadata: {
          purchaseId: payload.id,
          billingPeriodStart: newStart.getTime(),
          billingPeriodEnd: newEnd.getTime(),
        },
      });
    }
    else {
      // Initial payment — upgrade to Pro
      const billingPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const proLimits = getPlanLimits("pro");

      await db
        .update(workspaces)
        .set({
          plan: "pro",
          subscriptionStatus: "active",
          chipPurchaseToken: payload.id,
          billingPeriodStart: now,
          billingPeriodEnd,
          storageQuotaBytes: proLimits.storageQuotaBytes,
          cancelledAt: null,
          updatedAt: now,
        })
        .where(eq(workspaces.id, workspace.id));

      await logAdminAction({
        db,
        actorId: "system",
        action: "subscription_created",
        resourceType: "billing",
        resourceId: workspace.id,
        workspaceId: workspace.id,
        metadata: {
          purchaseId: payload.id,
          billingPeriodEnd: billingPeriodEnd.getTime(),
        },
      });
    }
  }
  else if (payload.event_type === "purchase.payment_failure") {
    // Payment failed — downgrade immediately
    const freeLimits = getPlanLimits("free");

    await db
      .update(workspaces)
      .set({
        plan: "free",
        subscriptionStatus: "past_due",
        storageQuotaBytes: freeLimits.storageQuotaBytes,
        updatedAt: now,
      })
      .where(eq(workspaces.id, workspace.id));

    await logAdminAction({
      db,
      actorId: "system",
      action: "subscription_payment_failed",
      resourceType: "billing",
      resourceId: workspace.id,
      workspaceId: workspace.id,
      metadata: {
        purchaseId: payload.id,
      },
    });
  }

  return c.json({ message: "OK" }, HttpStatusCodes.OK);
};
