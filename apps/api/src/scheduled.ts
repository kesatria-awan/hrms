import type { DrizzleD1Database } from "drizzle-orm/d1";

import { and, eq, gte, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import type * as schema from "@/api/db/schema";
import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { boards, columns, taskAssignees, tasks, workspaces } from "@/api/db/schema";
import { logAdminAction } from "@/api/lib/audit-logger";
import { chargeWithToken } from "@/api/lib/chip-client";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";
import { getPlanLimits, PLAN_PRICING } from "@/api/lib/plan-limits";

const EMAIL_CAP = 200;

/**
 * Handle scheduled due-date notification emails.
 * Runs as part of the daily cron trigger.
 *
 * - Approaching: tasks due today or tomorrow with dueDateEmailSent=false
 * - Overdue: tasks with dueDate before today (daily, no dedup flag)
 * - Soft cap of 200 emails per cron run
 */
export async function handleScheduledNotifications(
  env: AppEnv["Bindings"],
  db: DrizzleD1Database<typeof schema>,
): Promise<void> {
  const now = new Date();
  // Compute UTC day boundaries (Unix seconds) to avoid local-time pitfalls
  const todayStartSec = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
  const dayAfterTomorrowStartSec = todayStartSec + 2 * 24 * 60 * 60;
  const frontendUrl = env.FRONTEND_URL ?? "http://localhost:5173";

  // Query approaching tasks (due today or tomorrow, dueDateEmailSent=false)
  // dueDate stored as Unix seconds in D1 (mode: "timestamp" in Drizzle maps to integer seconds)
  const approachingRows = await db
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskDescription: tasks.description,
      taskPriority: tasks.priority,
      taskDueDate: tasks.dueDate,
      boardId: boards.id,
      boardName: boards.name,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
      columnName: columns.name,
      assigneeId: taskAssignees.userId,
      assigneeRowId: taskAssignees.id,
    })
    .from(tasks)
    .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
    .innerJoin(columns, eq(columns.id, tasks.columnId))
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
    .where(
      and(
        isNotNull(tasks.dueDate),
        // dueDate >= todayStart (unix seconds)
        gte(tasks.dueDate, sql`${todayStartSec}`),
        // dueDate < dayAfterTomorrowStart (exclusive)
        lt(tasks.dueDate, sql`${dayAfterTomorrowStartSec}`),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt),
        isNull(boards.deletedAt),
        eq(columns.isDoneColumn, false),
        eq(taskAssignees.dueDateEmailSent, false),
      ),
    )
    .orderBy(tasks.dueDate);

  // Query overdue tasks (dueDate before today)
  const overdueRows = await db
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskDescription: tasks.description,
      taskPriority: tasks.priority,
      taskDueDate: tasks.dueDate,
      boardId: boards.id,
      boardName: boards.name,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
      columnName: columns.name,
      assigneeId: taskAssignees.userId,
      assigneeRowId: taskAssignees.id,
    })
    .from(tasks)
    .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
    .innerJoin(columns, eq(columns.id, tasks.columnId))
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
    .where(
      and(
        isNotNull(tasks.dueDate),
        lt(tasks.dueDate, sql`${todayStartSec}`),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt),
        isNull(boards.deletedAt),
        eq(columns.isDoneColumn, false),
      ),
    )
    .orderBy(tasks.dueDate);

  let emailsSent = 0;
  let emailsFailed = 0;
  let emailsSkipped = 0;

  // Process approaching rows first
  for (const row of approachingRows) {
    if (emailsSent >= EMAIL_CAP) {
      emailsSkipped++;
      continue;
    }

    const dueDate = row.taskDueDate as Date;
    const dueDateSec = Math.floor(dueDate.getTime() / 1000);
    const daysUntilDue = Math.round((dueDateSec - todayStartSec) / (24 * 60 * 60));
    const formattedDueDate = dueDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const descriptionPreview = row.taskDescription
      ? row.taskDescription.length > 100
        ? `${row.taskDescription.slice(0, 100)}...`
        : row.taskDescription
      : undefined;
    const priorityLabel = row.taskPriority
      ? row.taskPriority.charAt(0).toUpperCase() + row.taskPriority.slice(1)
      : undefined;

    try {
      await dispatchNotificationEmail({
        db,
        env,
        type: "due_date_approaching",
        actorId: "system",
        recipientId: row.assigneeId,
        payload: {
          actorName: "Tracky",
          taskTitle: row.taskTitle,
          boardName: row.boardName,
          boardId: row.boardId,
          taskId: row.taskId,
          workspaceSlug: row.workspaceSlug,
          workspaceName: row.workspaceName,
          dueDate: formattedDueDate,
          daysUntilDue,
          descriptionPreview,
          priorityLabel,
          columnName: row.columnName,
          ctaUrl: `${frontendUrl}/${row.workspaceSlug}/boards/${row.boardId}/tasks/${row.taskId}`,
          preferencesUrl: `${frontendUrl}/settings#notifications`,
        },
      });
      // Update flag AFTER successful dispatch
      await db
        .update(taskAssignees)
        .set({ dueDateEmailSent: true })
        .where(eq(taskAssignees.id, row.assigneeRowId));
      emailsSent++;
    }
    catch (error) {
      console.error(`[scheduled-notifications] Failed to send due_date_approaching for task ${row.taskId}:`, error);
      emailsFailed++;
    }
  }

  // Process overdue rows
  for (const row of overdueRows) {
    if (emailsSent >= EMAIL_CAP) {
      emailsSkipped++;
      continue;
    }

    const dueDate = row.taskDueDate as Date;
    const dueDateSec = Math.floor(dueDate.getTime() / 1000);
    const daysOverdue = Math.round((todayStartSec - dueDateSec) / (24 * 60 * 60));
    const formattedDueDate = dueDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const descriptionPreview = row.taskDescription
      ? row.taskDescription.length > 100
        ? `${row.taskDescription.slice(0, 100)}...`
        : row.taskDescription
      : undefined;
    const priorityLabel = row.taskPriority
      ? row.taskPriority.charAt(0).toUpperCase() + row.taskPriority.slice(1)
      : undefined;

    try {
      await dispatchNotificationEmail({
        db,
        env,
        type: "task_overdue",
        actorId: "system",
        recipientId: row.assigneeId,
        payload: {
          actorName: "Tracky",
          taskTitle: row.taskTitle,
          boardName: row.boardName,
          boardId: row.boardId,
          taskId: row.taskId,
          workspaceSlug: row.workspaceSlug,
          workspaceName: row.workspaceName,
          dueDate: formattedDueDate,
          daysOverdue,
          descriptionPreview,
          priorityLabel,
          columnName: row.columnName,
          ctaUrl: `${frontendUrl}/${row.workspaceSlug}/boards/${row.boardId}/tasks/${row.taskId}`,
          preferencesUrl: `${frontendUrl}/settings#notifications`,
        },
      });
      emailsSent++;
    }
    catch (error) {
      console.error(`[scheduled-notifications] Failed to send task_overdue for task ${row.taskId}:`, error);
      emailsFailed++;
    }
  }

  // eslint-disable-next-line no-console -- intentional monitoring output per D-29
  console.log(`[scheduled-notifications] sent=${emailsSent} failed=${emailsFailed} skipped=${emailsSkipped}`);
  if (emailsSkipped > 0) {
    console.warn(`[scheduled-notifications] soft cap reached, ${emailsSkipped} emails skipped`);
  }
}

/**
 * Scheduled handler for subscription auto-renewal and cancellation processing.
 * Runs daily via Cloudflare Cron Triggers.
 */
export async function handleScheduled(env: AppEnv["Bindings"]): Promise<void> {
  const db = createDb(env);
  const now = new Date();
  const baseUrl = env.FRONTEND_URL || "http://localhost:8787";

  // 1. Renew active subscriptions past their billing period
  const activeExpired = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.subscriptionStatus, "active"),
        lte(workspaces.billingPeriodEnd, now),
      ),
    );

  for (const workspace of activeExpired) {
    if (!workspace.chipPurchaseToken || !workspace.chipClientId) {
      continue;
    }

    try {
      await chargeWithToken(
        env.CHIP_API_KEY,
        env.CHIP_BRAND_ID,
        workspace.chipPurchaseToken,
        PLAN_PRICING.pro.monthlyPriceCents,
        PLAN_PRICING.pro.currency,
        PLAN_PRICING.pro.productName,
        workspace.chipClientId,
        workspace.id,
        `${baseUrl}/api/webhooks/chip`,
      );
      // Webhook handler will handle the success/failure state update
    }
    catch (error) {
      // If the charge call itself fails (network error etc.), log it
      console.error(`Failed to charge workspace ${workspace.id}:`, error);
    }
  }

  // 2. Downgrade cancelling subscriptions past their billing period
  const cancellingExpired = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.subscriptionStatus, "cancelling"),
        lte(workspaces.billingPeriodEnd, now),
      ),
    );

  const freeLimits = getPlanLimits("free");

  for (const workspace of cancellingExpired) {
    await db
      .update(workspaces)
      .set({
        plan: "free",
        subscriptionStatus: "none",
        storageQuotaBytes: freeLimits.storageQuotaBytes,
        chipPurchaseToken: null,
        billingPeriodStart: null,
        billingPeriodEnd: null,
        cancelledAt: null,
        updatedAt: now,
      })
      .where(eq(workspaces.id, workspace.id));

    await logAdminAction({
      db,
      actorId: "system",
      action: "subscription_downgraded",
      resourceType: "billing",
      resourceId: workspace.id,
      workspaceId: workspace.id,
      metadata: {
        reason: "cancellation_period_ended",
      },
    });
  }

  // 3. Send scheduled due-date notification emails
  await handleScheduledNotifications(env, db);
}
