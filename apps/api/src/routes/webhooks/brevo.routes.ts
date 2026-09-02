import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";

const brevoWebhookBodySchema = z.object({
  "event": z.string(),
  "email": z.string().email(),
  "message-id": z.string().optional(),
  "ts_epoch": z.number().optional(),
  "subject": z.string().optional(),
}).passthrough();

export const brevoWebhook = createRoute({
  method: "post",
  path: "/brevo",
  tags: ["Webhooks"],
  summary: "Handle Brevo email webhook events (bounce, unsubscribe)",
  description: "Receives webhook events from Brevo. Hard bounces and unsubscribes suppress future notification emails for the affected user.",
  request: {
    body: {
      content: { "application/json": { schema: brevoWebhookBodySchema } },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: { description: "Webhook processed" },
    [HttpStatusCodes.UNAUTHORIZED]: { description: "Invalid or missing webhook secret" },
  },
});

export type BrevoWebhookRoute = typeof brevoWebhook;
