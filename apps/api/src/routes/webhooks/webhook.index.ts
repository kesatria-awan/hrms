import createRouter from "@/api/lib/create-router";

import { brevoWebhookHandler } from "./brevo.handlers";
import { brevoWebhook } from "./brevo.routes";
import { chipWebhookHandler } from "./chip.handlers";
import { chipWebhook } from "./chip.routes";

const router = createRouter()
  .openapi(chipWebhook, chipWebhookHandler)
  .openapi(brevoWebhook, brevoWebhookHandler);

export default router;
