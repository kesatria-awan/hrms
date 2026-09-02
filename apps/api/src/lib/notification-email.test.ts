import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationEmailType } from "./email-templates";

import { sendEmail } from "./email";
import { buildNotificationEmail } from "./email-templates";
import { dispatchNotificationEmail } from "./notification-email";

// Mock sendEmail
vi.mock("./email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
}));

const ALL_NOTIFICATION_TYPES: NotificationEmailType[] = [
  "task_assigned",
  "task_updated",
  "mention",
  "comment_on_task",
  "attachment_on_task",
  "member_joined",
  "role_changed",
  "board_membership_changed",
];

const basePayload = {
  actorName: "Alice Smith",
  taskTitle: "Fix critical bug",
  boardName: "Engineering Board",
  boardId: "board-1",
  taskId: "task-1",
  workspaceSlug: "acme",
  workspaceName: "Acme Corp",
  newRole: "admin",
  changeType: "added" as const,
  commentPreview: "Great work on this!",
  changedFields: "status, priority",
  ctaUrl: "https://tracky.pro/acme/tasks/task-1",
  preferencesUrl: "https://tracky.pro/settings#notifications",
};

describe("buildNotificationEmail", () => {
  it("produces non-empty subject and HTML for all 8 notification types", () => {
    for (const type of ALL_NOTIFICATION_TYPES) {
      const result = buildNotificationEmail(type, basePayload);
      expect(result.subject, `subject for ${type}`).toBeTruthy();
      expect(result.html, `html for ${type}`).toBeTruthy();
      expect(result.html.length, `html length for ${type}`).toBeGreaterThan(100);
    }
  });

  it("all 8 types include 'Manage email preferences' in HTML", () => {
    for (const type of ALL_NOTIFICATION_TYPES) {
      const { html } = buildNotificationEmail(type, basePayload);
      expect(html, `${type} should contain 'Manage email preferences'`).toContain(
        "Manage email preferences",
      );
    }
  });

  it("all 8 types include '/settings#notifications' in HTML", () => {
    for (const type of ALL_NOTIFICATION_TYPES) {
      const { html } = buildNotificationEmail(type, basePayload);
      expect(html, `${type} should contain '/settings#notifications'`).toContain(
        "/settings#notifications",
      );
    }
  });

  it("task_assigned subject contains actorName and taskTitle", () => {
    const { subject } = buildNotificationEmail("task_assigned", basePayload);
    expect(subject).toContain(basePayload.actorName);
    expect(subject).toContain(basePayload.taskTitle!);
  });

  it("member_joined subject contains actorName and workspaceName", () => {
    const { subject } = buildNotificationEmail("member_joined", basePayload);
    expect(subject).toContain(basePayload.actorName);
    expect(subject).toContain(basePayload.workspaceName!);
  });

  it("task_assigned subject contains 'assigned you a task'", () => {
    const { subject } = buildNotificationEmail("task_assigned", basePayload);
    expect(subject).toContain("assigned you a task");
  });
});

// Mock DB helper
function createMockDb({
  user,
  prefs,
}: {
  user?: {
    email: string;
    firstName: string | null;
    emailSuppressed: boolean;
  } | null;
  prefs?: {
    taskNotifications: boolean;
    collaborationNotifications: boolean;
    adminNotifications: boolean;
  } | null;
}) {
  const mockSelect = vi.fn();

  // Mock chained query builder
  const makeChain = (result: unknown[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  });

  // First call = user query, second call = prefs query
  let callCount = 0;
  mockSelect.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return makeChain(user ? [user] : []);
    }
    return makeChain(prefs ? [prefs] : []);
  });

  return { select: mockSelect } as unknown as Parameters<
    typeof dispatchNotificationEmail
  >[0]["db"];
}

const mockEnv = {
  BREVO_API_KEY: "test-api-key",
  FRONTEND_URL: "https://tracky.pro",
};

describe("dispatchNotificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when actorId === recipientId (no email sent)", async () => {
    const db = createMockDb({ user: null });
    await dispatchNotificationEmail({
      db,
      env: mockEnv,
      type: "task_assigned",
      actorId: "user-1",
      recipientId: "user-1",
      payload: { ...basePayload },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when recipient.emailSuppressed is true (no email sent)", async () => {
    const db = createMockDb({
      user: { email: "bob@example.com", firstName: "Bob", emailSuppressed: true },
      prefs: null,
    });
    await dispatchNotificationEmail({
      db,
      env: mockEnv,
      type: "task_assigned",
      actorId: "actor-1",
      recipientId: "user-1",
      payload: { ...basePayload },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends when no notification_preferences row exists (all-enabled default)", async () => {
    const db = createMockDb({
      user: { email: "bob@example.com", firstName: "Bob", emailSuppressed: false },
      prefs: null,
    });
    await dispatchNotificationEmail({
      db,
      env: mockEnv,
      type: "task_assigned",
      actorId: "actor-1",
      recipientId: "user-1",
      payload: { ...basePayload },
    });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("skips when category preference is disabled (taskNotifications = false)", async () => {
    const db = createMockDb({
      user: { email: "bob@example.com", firstName: "Bob", emailSuppressed: false },
      prefs: {
        taskNotifications: false,
        collaborationNotifications: true,
        adminNotifications: true,
      },
    });
    await dispatchNotificationEmail({
      db,
      env: mockEnv,
      type: "task_assigned",
      actorId: "actor-1",
      recipientId: "user-1",
      payload: { ...basePayload },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when collaboration preference is disabled", async () => {
    const db = createMockDb({
      user: { email: "bob@example.com", firstName: "Bob", emailSuppressed: false },
      prefs: {
        taskNotifications: true,
        collaborationNotifications: false,
        adminNotifications: true,
      },
    });
    await dispatchNotificationEmail({
      db,
      env: mockEnv,
      type: "mention",
      actorId: "actor-1",
      recipientId: "user-1",
      payload: { ...basePayload },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends when category preference is enabled", async () => {
    const db = createMockDb({
      user: { email: "bob@example.com", firstName: "Bob", emailSuppressed: false },
      prefs: {
        taskNotifications: true,
        collaborationNotifications: true,
        adminNotifications: true,
      },
    });
    await dispatchNotificationEmail({
      db,
      env: mockEnv,
      type: "task_assigned",
      actorId: "actor-1",
      recipientId: "user-1",
      payload: { ...basePayload },
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(
      mockEnv,
      expect.objectContaining({
        to: { email: "bob@example.com", name: "Bob" },
      }),
    );
  });

  it("does not throw even when sendEmail rejects (fire-and-forget)", async () => {
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Brevo API error"),
    );
    const db = createMockDb({
      user: { email: "bob@example.com", firstName: "Bob", emailSuppressed: false },
      prefs: null,
    });
    await expect(
      dispatchNotificationEmail({
        db,
        env: mockEnv,
        type: "task_assigned",
        actorId: "actor-1",
        recipientId: "user-1",
        payload: { ...basePayload },
      }),
    ).resolves.not.toThrow();
  });
});
