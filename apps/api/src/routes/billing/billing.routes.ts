import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { jwtAuth } from "@/api/middlewares/jwt-auth";
import { requireVerified } from "@/api/middlewares/require-verified";

const tags = ["Billing"];

// POST /workspaces/{slug}/billing/checkout — Create CHIP checkout session
export const createCheckout = createRoute({
  method: "post",
  path: "/workspaces/{slug}/billing/checkout",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Create checkout session",
  description: "Create a CHIP checkout session for Pro plan upgrade",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({
        checkoutUrl: z.string(),
        purchaseId: z.string(),
      }),
      "Checkout session created",
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Workspace is already on Pro plan"),
      "Already on Pro",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Only workspace admins can manage billing"),
      "Forbidden",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Not found",
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      createMessageObjectSchema("Failed to create checkout session"),
      "Server error",
    ),
  },
});

// POST /workspaces/{slug}/billing/cancel — Cancel subscription
export const cancelSubscription = createRoute({
  method: "post",
  path: "/workspaces/{slug}/billing/cancel",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Cancel subscription",
  description: "Cancel Pro subscription (keeps Pro until billing period ends)",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        message: z.string(),
        billingPeriodEnd: z.number().nullable(),
      }),
      "Subscription cancelled",
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("No active subscription to cancel"),
      "No subscription",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Only workspace admins can manage billing"),
      "Forbidden",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Not found",
    ),
  },
});

// GET /workspaces/{slug}/billing/status — Get subscription details
export const getBillingStatus = createRoute({
  method: "get",
  path: "/workspaces/{slug}/billing/status",
  tags,
  middleware: [jwtAuth(), requireVerified()] as const,
  summary: "Get billing status",
  description: "Get current subscription and billing details",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        subscriptionStatus: z.enum(["none", "active", "cancelling", "past_due"]),
        plan: z.enum(["free", "pro"]),
        billingPeriodStart: z.number().nullable(),
        billingPeriodEnd: z.number().nullable(),
        cancelledAt: z.number().nullable(),
      }),
      "Billing status",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Workspace not found"),
      "Not found",
    ),
  },
});

export type CreateCheckoutRoute = typeof createCheckout;
export type CancelSubscriptionRoute = typeof cancelSubscription;
export type GetBillingStatusRoute = typeof getBillingStatus;
