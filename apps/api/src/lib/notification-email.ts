import type { DrizzleD1Database } from "drizzle-orm/d1";

import { eq } from "drizzle-orm";

import type * as schema from "../db/schema";
import type { EmailEnv } from "./email";
import type { NotificationEmailPayload, NotificationEmailType } from "./email-templates";

import { notificationPreferences, users } from "../db/schema";
import { sendEmail } from "./email";
import {
  buildNotificationEmail,
} from "./email-templates";

// Re-export types for handler convenience
export type { NotificationEmailPayload, NotificationEmailType } from "./email-templates";

export type NotificationCategory = "task" | "collaboration" | "admin";

const CATEGORY_MAP: Record<NotificationEmailType, NotificationCategory> = {
  task_assigned: "task",
  task_updated: "task",
  mention: "collaboration",
  comment_on_task: "collaboration",
  attachment_on_task: "collaboration",
  member_joined: "admin",
  role_changed: "admin",
  board_membership_changed: "admin",
  due_date_approaching: "task",
  task_overdue: "task",
};

export type DispatchNotificationEmailParams = {
  db: DrizzleD1Database<typeof schema>;
  env: EmailEnv & { FRONTEND_URL?: string };
  type: NotificationEmailType;
  actorId: string;
  recipientId: string;
  payload: NotificationEmailPayload;
};

/**
 * Dispatch a notification email to a recipient.
 * Guards:
 *   1. Self-action guard: skip if actorId === recipientId (INFRA-02, D-16)
 *   2. Suppression guard: skip if user.emailSuppressed is true (D-10, D-11)
 *   3. Preference guard: skip if category is disabled in notification_preferences (PREF-02)
 *      Missing prefs row = all-enabled (D-15)
 *
 * Sends fire-and-forget via sendEmail().catch(() => {}) (INFRA-01, D-13).
 */
export async function dispatchNotificationEmail(
  params: DispatchNotificationEmailParams,
): Promise<void> {
  const { db, env, type, actorId, recipientId, payload } = params;

  // Guard 1: Skip self-actions
  if (actorId === recipientId) {
    return;
  }

  // Guard 2: Look up recipient — check suppression
  const [recipient] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      emailSuppressed: users.emailSuppressed,
    })
    .from(users)
    .where(eq(users.id, recipientId))
    .limit(1);

  if (!recipient || recipient.emailSuppressed) {
    return;
  }

  // Guard 3: Check notification preferences
  const category = CATEGORY_MAP[type];
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, recipientId))
    .limit(1);

  if (prefs) {
    const enabled
      = category === "task"
        ? prefs.taskNotifications
        : category === "collaboration"
          ? prefs.collaborationNotifications
          : prefs.adminNotifications;

    if (!enabled) {
      return;
    }
  }
  // No prefs row = all-enabled (PREF-02, D-15) — fall through

  // Build and send email
  const { subject, html } = buildNotificationEmail(type, payload);

  await sendEmail(env, {
    to: {
      email: recipient.email,
      name: recipient.firstName ?? undefined,
    },
    subject,
    htmlContent: html,
  }).catch(() => {});
}
