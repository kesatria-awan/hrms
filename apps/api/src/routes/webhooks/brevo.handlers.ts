import { eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { users } from "@/api/db/schema";

import type { BrevoWebhookRoute } from "./brevo.routes";

export const brevoWebhookHandler: AppRouteHandler<BrevoWebhookRoute> = async (c) => {
  const secret = c.req.query("secret");
  if (!secret || secret !== c.env.BREVO_WEBHOOK_SECRET) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const payload = c.req.valid("json");

  if (payload.event === "hard_bounce" || payload.event === "unsubscribed") {
    const db = createDb(c.env);
    await db
      .update(users)
      .set({ emailSuppressed: true, updatedAt: new Date() })
      .where(eq(users.email, payload.email));
  }

  return c.json({ message: "OK" }, HttpStatusCodes.OK);
};
