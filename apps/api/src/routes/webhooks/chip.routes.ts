import { createRoute } from "@hono/zod-openapi";

export const chipWebhook = createRoute({
  method: "post",
  path: "/chip",
  tags: ["Webhooks"],
  summary: "Handle CHIP payment webhook events",
  description: "Receives and processes webhook events from CHIP payment gateway (purchase.paid, purchase.payment_failure)",
  responses: {
    200: {
      description: "Webhook processed successfully",
    },
    400: {
      description: "Webhook verification failed",
    },
  },
});

export type ChipWebhookRoute = typeof chipWebhook;
