/**
 * HTML email template builders for transactional emails.
 * Per D-08 and UI-SPEC email template contract.
 */

// Notification email types — defined here to avoid circular imports with notification-email.ts
export type NotificationEmailType
  = | "task_assigned"
    | "task_updated"
    | "mention"
    | "comment_on_task"
    | "attachment_on_task"
    | "member_joined"
    | "role_changed"
    | "board_membership_changed"
    | "due_date_approaching"
    | "task_overdue";

export type NotificationEmailPayload = {
  actorName: string;
  taskTitle?: string;
  boardName?: string;
  boardId?: string;
  taskId?: string;
  workspaceSlug?: string;
  workspaceName?: string;
  newRole?: string;
  changeType?: "added" | "removed";
  commentPreview?: string;
  changedFields?: string;
  // Scheduled notification fields (due_date_approaching, task_overdue)
  dueDate?: string; // formatted: "Mar 29, 2026"
  daysUntilDue?: number; // 0 = today, 1 = tomorrow (for approaching)
  daysOverdue?: number; // 1+ (for overdue)
  descriptionPreview?: string; // first 100 chars of task description
  priorityLabel?: string; // "High" / "Medium" / "Low"
  columnName?: string; // task's current status column name
  assigneesList?: string; // comma-separated assignee names
  assignerName?: string; // who created the task
  ctaUrl: string;
  preferencesUrl: string;
};

// Tracky Pro logo hosted on production domain — external URL works better than data URIs in most email clients
const TRACKY_LOGO_URL = "https://app.tracky.pro/Logo%20TrackyPro.svg";

function buildEmailWrapper(heading: string, bodyContent: string, footerText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#333333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <!-- Logo header -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <img src="${TRACKY_LOGO_URL}" alt="Tracky Pro" width="44" height="44" style="display:block;" />
              <span style="display:block;margin-top:8px;font-size:18px;font-weight:700;color:#1e293b;letter-spacing:-0.3px;">Tracky Pro</span>
            </td>
          </tr>
        </table>
        <!-- Main card -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Blue accent bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#2563eb,#3b82f6);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:36px 40px 20px;">
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${heading}</h1>
              ${bodyContent}
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0 0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;">
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">${footerText}</p>
            </td>
          </tr>
        </table>
        <!-- Bottom branding -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Tracky Pro. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildActionButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.2px;box-shadow:0 1px 2px rgba(37,99,235,0.3);">${label}</a>`;
}

/**
 * Build a verification email HTML body.
 * Subject (caller responsibility): "Verify your email address"
 */
export function buildVerificationEmail(verificationUrl: string): string {
  const body = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
      Thank you for signing up for Tracky. Please verify your email address to get started.
    </p>
    ${buildActionButton(verificationUrl, "Verify your email")}
    <p style="margin:16px 0 0;font-size:14px;color:#666666;">
      This link expires in 24 hours. If the button above doesn't work, copy and paste this URL into your browser:
      <br /><a href="${verificationUrl}" style="color:#2563eb;word-break:break-all;">${verificationUrl}</a>
    </p>
  `;
  return buildEmailWrapper(
    "Verify your email",
    body,
    "If you didn't create a Tracky account, you can safely ignore this email.",
  );
}

/**
 * Build a workspace invitation email HTML body.
 * Subject (caller responsibility): "You've been invited to join [workspaceName] on Tracky"
 */
export function buildInvitationEmail(params: {
  inviteUrl: string;
  workspaceName: string;
  inviterName: string;
  role: string;
}): string {
  const roleLabel = params.role === "admin" ? "an admin" : "a member";
  const body = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
      <strong>${params.inviterName}</strong> invited you to join <strong>${params.workspaceName}</strong> as ${roleLabel}.
    </p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
      Click the button below to accept the invitation and get started.
    </p>
    ${buildActionButton(params.inviteUrl, "Join workspace")}
    <p style="margin:16px 0 0;font-size:14px;color:#666666;">
      This invitation expires in 7 days. If the button above doesn't work, copy and paste this URL into your browser:
      <br /><a href="${params.inviteUrl}" style="color:#2563eb;word-break:break-all;">${params.inviteUrl}</a>
    </p>
  `;
  return buildEmailWrapper(
    `Join ${params.workspaceName}`,
    body,
    "If you weren't expecting this invitation, you can safely ignore this email.",
  );
}

/**
 * Build a password reset email HTML body.
 * Subject (caller responsibility): "Reset your Tracky password"
 */
export function buildPasswordResetEmail(resetUrl: string): string {
  const body = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
      We received a request to reset your Tracky password. Click the button below to choose a new password.
    </p>
    ${buildActionButton(resetUrl, "Reset your password")}
    <p style="margin:16px 0 0;font-size:14px;color:#666666;">
      This link expires in 1 hour. If the button above doesn't work, copy and paste this URL into your browser:
      <br /><a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
    </p>
  `;
  return buildEmailWrapper(
    "Reset your password",
    body,
    "If you didn't request this, you can safely ignore this email. Your password will not be changed.",
  );
}

/**
 * Build a notification email for workspace activity events.
 * Returns { subject, html } for use by dispatchNotificationEmail().
 * Per D-01 (professional-casual tone), D-02 (context in body), D-04 (footer preferences link),
 * INFRA-03 (footer link to /settings#notifications).
 */
export function buildNotificationEmail(
  type: NotificationEmailType,
  payload: NotificationEmailPayload,
): { subject: string; html: string } {
  const {
    actorName,
    taskTitle,
    boardName,
    workspaceName,
    newRole,
    changeType,
    ctaUrl,
    preferencesUrl,
  } = payload;

  let subject: string;
  let bodyDescription: string;
  let ctaLabel: string;

  switch (type) {
    case "task_assigned":
      subject = `${actorName} assigned you a task: ${taskTitle}`;
      bodyDescription = `<strong>${actorName}</strong> assigned you the task <strong>${taskTitle}</strong>${boardName ? ` on board <strong>${boardName}</strong>` : ""}.`;
      ctaLabel = "View task";
      break;
    case "task_updated":
      subject = `${actorName} updated a task: ${taskTitle}`;
      bodyDescription = `<strong>${actorName}</strong> updated the task <strong>${taskTitle}</strong>${boardName ? ` on board <strong>${boardName}</strong>` : ""}.`;
      ctaLabel = "View task";
      break;
    case "mention":
      subject = `${actorName} mentioned you in a comment on: ${taskTitle}`;
      bodyDescription = `<strong>${actorName}</strong> mentioned you in a comment on task <strong>${taskTitle}</strong>${boardName ? ` on board <strong>${boardName}</strong>` : ""}.`;
      ctaLabel = "View task";
      break;
    case "comment_on_task":
      subject = `${actorName} commented on: ${taskTitle}`;
      bodyDescription = `<strong>${actorName}</strong> left a comment on your task <strong>${taskTitle}</strong>${boardName ? ` on board <strong>${boardName}</strong>` : ""}.`;
      ctaLabel = "View task";
      break;
    case "attachment_on_task":
      subject = `${actorName} added an attachment to: ${taskTitle}`;
      bodyDescription = `<strong>${actorName}</strong> added an attachment to task <strong>${taskTitle}</strong>${boardName ? ` on board <strong>${boardName}</strong>` : ""}.`;
      ctaLabel = "View task";
      break;
    case "member_joined":
      subject = `${actorName} joined ${workspaceName}`;
      bodyDescription = `<strong>${actorName}</strong> has joined the <strong>${workspaceName}</strong> workspace.`;
      ctaLabel = "View members";
      break;
    case "role_changed":
      subject = `Your role was changed to ${newRole}`;
      bodyDescription = `<strong>${actorName}</strong> changed your workspace role to <strong>${newRole}</strong>.`;
      ctaLabel = "View workspace";
      break;
    case "board_membership_changed":
      subject = `You were ${changeType} board: ${boardName}`;
      bodyDescription = `<strong>${actorName}</strong> ${changeType === "added" ? "added you to" : "removed you from"} board <strong>${boardName}</strong>.`;
      ctaLabel = "View workspace";
      break;
    case "due_date_approaching": {
      const { daysUntilDue, dueDate, priorityLabel, descriptionPreview, columnName } = payload;
      const whenLabel = daysUntilDue === 0 ? "today" : "tomorrow";
      subject = `[${boardName}] Heads up -- your task '${taskTitle}' is due ${whenLabel}`;
      let approachingDetails = "";
      if (priorityLabel) {
        approachingDetails += `\n      <p style="margin:8px 0 0;font-size:14px;color:#666666;"><strong>Priority:</strong> ${priorityLabel}</p>`;
      }
      if (columnName) {
        approachingDetails += `\n      <p style="margin:8px 0 0;font-size:14px;color:#666666;"><strong>Status:</strong> ${columnName}</p>`;
      }
      if (descriptionPreview) {
        approachingDetails += `\n      <p style="margin:8px 0 0;font-size:14px;color:#666666;">${descriptionPreview}</p>`;
      }
      bodyDescription = `Heads up -- your task <strong>${taskTitle}</strong> on board <strong>${boardName}</strong> is due ${whenLabel}${dueDate ? ` (${dueDate})` : ""}.${approachingDetails}`;
      ctaLabel = "View task";
      break;
    }
    case "task_overdue": {
      const { daysOverdue, dueDate, priorityLabel, descriptionPreview, columnName } = payload;
      const dayWord = daysOverdue === 1 ? "day" : "days";
      subject = `[${boardName}] Your task '${taskTitle}' is ${daysOverdue} ${dayWord} overdue`;
      let overdueDetails = "";
      if (priorityLabel) {
        overdueDetails += `\n      <p style="margin:8px 0 0;font-size:14px;color:#666666;"><strong>Priority:</strong> ${priorityLabel}</p>`;
      }
      if (columnName) {
        overdueDetails += `\n      <p style="margin:8px 0 0;font-size:14px;color:#666666;"><strong>Status:</strong> ${columnName}</p>`;
      }
      if (descriptionPreview) {
        overdueDetails += `\n      <p style="margin:8px 0 0;font-size:14px;color:#666666;">${descriptionPreview}</p>`;
      }
      bodyDescription = `Your task <strong>${taskTitle}</strong> on board <strong>${boardName}</strong> is ${daysOverdue} ${dayWord} overdue${dueDate ? ` (was due ${dueDate})` : ""}.${overdueDetails}`;
      ctaLabel = "View task";
      break;
    }
  }

  const body = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
      ${bodyDescription}
    </p>
    ${buildActionButton(ctaUrl, ctaLabel)}
  `;

  const workspaceFooterNote = payload.workspaceName
    ? `You're receiving this because you're a member of <strong>${payload.workspaceName}</strong> on Tracky. `
    : "";
  const footer = `${workspaceFooterNote}<a href="${preferencesUrl}" style="color:#2563eb;">Manage email preferences</a>`;

  const html = buildEmailWrapper(subject, body, footer);

  return { subject, html };
}
