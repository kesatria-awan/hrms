import { applyD1Migrations, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { createDb } from "@/api/db";
import {
  auditLogs,
  boardMembers,
  boards,
  columns,
  taskAssignees,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "@/api/db/schema";
import { chargeWithToken } from "@/api/lib/chip-client";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";

import { handleScheduled } from "./scheduled";

// Mock notification-email BEFORE other imports
vi.mock("@/api/lib/notification-email", () => ({
  dispatchNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const typedEnv = env as unknown as AppEnv["Bindings"];
const testEnv = env as unknown as AppEnv["Bindings"] & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

// Mock CHIP client
vi.mock("@/api/lib/chip-client", () => ({
  chargeWithToken: vi.fn().mockResolvedValue({
    id: "purchase_renewal_123",
    status: "created",
  }),
}));

describe("scheduled handler", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  it("charges active workspaces past billing period", async () => {
    const db = createDb(typedEnv);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

    await db.insert(workspaces).values({
      name: "Active Workspace",
      slug: "active-workspace",
      ownerId: "user_1",
      plan: "pro",
      subscriptionStatus: "active",
      chipPurchaseToken: "token_123",
      chipClientId: "client_123",
      billingPeriodStart: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
      billingPeriodEnd: pastDate,
    });

    await handleScheduled(typedEnv);

    expect(chargeWithToken).toHaveBeenCalledTimes(1);
    expect(chargeWithToken).toHaveBeenCalledWith(
      typedEnv.CHIP_API_KEY,
      typedEnv.CHIP_BRAND_ID,
      "token_123",
      4900,
      "MYR",
      "Tracky Pro Monthly",
      "client_123",
      expect.any(String),
      expect.stringContaining("/api/webhooks/chip"),
    );
  });

  it("skips active workspaces with future billing period", async () => {
    const db = createDb(typedEnv);
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

    await db.insert(workspaces).values({
      name: "Active Future Workspace",
      slug: "active-future",
      ownerId: "user_1",
      plan: "pro",
      subscriptionStatus: "active",
      chipPurchaseToken: "token_456",
      chipClientId: "client_456",
      billingPeriodStart: new Date(),
      billingPeriodEnd: futureDate,
    });

    await handleScheduled(typedEnv);

    expect(chargeWithToken).not.toHaveBeenCalled();
  });

  it("downgrades cancelling workspaces past billing period", async () => {
    const db = createDb(typedEnv);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [ws] = await db
      .insert(workspaces)
      .values({
        name: "Cancelling Workspace",
        slug: "cancelling-workspace",
        ownerId: "user_1",
        plan: "pro",
        subscriptionStatus: "cancelling",
        chipPurchaseToken: "token_789",
        chipClientId: "client_789",
        billingPeriodStart: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        billingPeriodEnd: pastDate,
        cancelledAt: new Date(pastDate.getTime() - 10 * 24 * 60 * 60 * 1000),
      })
      .returning();

    await handleScheduled(typedEnv);

    const [updated] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, ws.id))
      .limit(1);

    expect(updated.plan).toBe("free");
    expect(updated.subscriptionStatus).toBe("none");
    expect(updated.storageQuotaBytes).toBe(524_288_000); // 500MB
    expect(updated.chipPurchaseToken).toBeNull();
    expect(updated.billingPeriodStart).toBeNull();
    expect(updated.billingPeriodEnd).toBeNull();
    expect(updated.cancelledAt).toBeNull();

    // Check audit log
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "subscription_downgraded"));
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe("system");
  });

  it("skips cancelling workspaces with future billing period", async () => {
    const db = createDb(typedEnv);
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const [ws] = await db
      .insert(workspaces)
      .values({
        name: "Cancelling Future Workspace",
        slug: "cancelling-future",
        ownerId: "user_1",
        plan: "pro",
        subscriptionStatus: "cancelling",
        chipPurchaseToken: "token_abc",
        chipClientId: "client_abc",
        billingPeriodStart: new Date(),
        billingPeriodEnd: futureDate,
        cancelledAt: new Date(),
      })
      .returning();

    await handleScheduled(typedEnv);

    const [updated] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, ws.id))
      .limit(1);

    // Should still be pro + cancelling
    expect(updated.plan).toBe("pro");
    expect(updated.subscriptionStatus).toBe("cancelling");
  });

  it("skips active workspaces without token or client ID", async () => {
    const db = createDb(typedEnv);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await db.insert(workspaces).values({
      name: "No Token Workspace",
      slug: "no-token",
      ownerId: "user_1",
      plan: "pro",
      subscriptionStatus: "active",
      chipPurchaseToken: null,
      chipClientId: null,
      billingPeriodStart: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
      billingPeriodEnd: pastDate,
    });

    await handleScheduled(typedEnv);

    expect(chargeWithToken).not.toHaveBeenCalled();
  });
});

// ==================== Scheduled Notifications Tests ====================

// Helper: create minimal workspace + user + board + column + task + assignee
async function setupNotificationData(db: ReturnType<typeof createDb>, opts?: {
  dueDateOffsetDays?: number; // positive = future, negative = past, undefined = no due date
  dueDateEmailSent?: boolean;
  isDoneColumn?: boolean;
  taskArchivedAt?: Date | null;
  taskDeletedAt?: Date | null;
  boardDeletedAt?: Date | null;
}) {
  const [workspace] = await db.insert(workspaces).values({
    name: "Notif Workspace",
    slug: `notif-ws-${crypto.randomUUID().slice(0, 8)}`,
    ownerId: "sys_user",
  }).returning();

  await db.insert(users).values({
    id: "sys_user",
    email: "sysuser@example.com",
    workspaceId: workspace.id,
    role: "workspace_admin",
  });

  await db.insert(users).values({
    id: "assignee_user",
    email: "assignee@example.com",
    workspaceId: workspace.id,
    role: "member",
  });

  await db.insert(workspaceMembers).values([
    { workspaceId: workspace.id, userId: "sys_user", role: "admin" },
    { workspaceId: workspace.id, userId: "assignee_user", role: "member" },
  ]);

  const [board] = await db.insert(boards).values({
    workspaceId: workspace.id,
    name: "Test Board",
    color: "#3B82F6",
    visibility: "workspace",
    createdById: "sys_user",
    position: 0,
    deletedAt: opts?.boardDeletedAt ?? null,
  }).returning();

  await db.insert(boardMembers).values({
    boardId: board.id,
    userId: "sys_user",
    role: "admin",
  });

  const [column] = await db.insert(columns).values({
    boardId: board.id,
    name: opts?.isDoneColumn ? "Done" : "To Do",
    position: 0,
    isDefault: true,
    isDoneColumn: opts?.isDoneColumn ?? false,
  }).returning();

  // Compute dueDate
  let dueDate: Date | undefined;
  if (opts?.dueDateOffsetDays !== undefined) {
    const nowUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    dueDate = new Date(nowUtc + opts.dueDateOffsetDays * 24 * 60 * 60 * 1000);
  }

  const [task] = await db.insert(tasks).values({
    workspaceId: workspace.id,
    boardId: board.id,
    columnId: column.id,
    title: "Test Task",
    description: "Task description",
    priority: "high",
    dueDate,
    position: 0,
    createdById: "sys_user",
    archivedAt: opts?.taskArchivedAt ?? null,
    deletedAt: opts?.taskDeletedAt ?? null,
  }).returning();

  const [assignee] = await db.insert(taskAssignees).values({
    taskId: task.id,
    userId: "assignee_user",
    dueDateEmailSent: opts?.dueDateEmailSent ?? false,
  }).returning();

  return { workspace, board, column, task, assignee };
}

describe("scheduled notifications", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createDb(typedEnv);
    // Clean tables in dependency order
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(taskAssignees);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(tasks);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boardMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(columns);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(boards);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaceMembers);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(auditLogs);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(users);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(workspaces);
  });

  // N01: Task due tomorrow, dueDateEmailSent=false -> dispatch due_date_approaching
  it("n01: dispatches due_date_approaching for task due tomorrow", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: 1, dueDateEmailSent: false });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "due_date_approaching",
        actorId: "system",
        recipientId: "assignee_user",
      }),
    );
  });

  // N02: Task due today, dueDateEmailSent=false -> dispatch due_date_approaching
  it("n02: dispatches due_date_approaching for task due today", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: 0, dueDateEmailSent: false });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "due_date_approaching",
        actorId: "system",
        recipientId: "assignee_user",
      }),
    );
  });

  // N03: After approaching dispatch, dueDateEmailSent is set to true
  it("n03: sets dueDateEmailSent=true after dispatching due_date_approaching", async () => {
    const db = createDb(typedEnv);
    const { assignee } = await setupNotificationData(db, { dueDateOffsetDays: 1, dueDateEmailSent: false });

    await handleScheduled(typedEnv);

    const [updated] = await db
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.id, assignee.id))
      .limit(1);

    expect(updated.dueDateEmailSent).toBe(true);
  });

  // N04: Task due tomorrow, dueDateEmailSent=true -> NOT dispatched (dedup)
  it("n04: skips due_date_approaching if dueDateEmailSent=true", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: 1, dueDateEmailSent: true });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "due_date_approaching" }),
    );
  });

  // N05: Task due in 3 days -> NOT included (only today/tomorrow)
  it("n05: does not dispatch for task due in 3 days", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: 3, dueDateEmailSent: false });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "due_date_approaching" }),
    );
  });

  // N06: Task overdue (yesterday) -> dispatch task_overdue with actorId "system"
  it("n06: dispatches task_overdue for task due yesterday", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: -1 });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "task_overdue",
        actorId: "system",
        recipientId: "assignee_user",
      }),
    );
  });

  // N07: Task 5 days overdue -> dispatch (daily repeat, no dedup flag)
  it("n07: dispatches task_overdue for task 5 days overdue", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: -5 });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "task_overdue",
        actorId: "system",
        recipientId: "assignee_user",
      }),
    );
  });

  // N08: Overdue task in done column -> NOT dispatched
  it("n08: skips overdue task in done column", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: -1, isDoneColumn: true });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task_overdue" }),
    );
  });

  // N09: Overdue task with archivedAt set -> NOT dispatched
  it("n09: skips overdue archived task", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: -1, taskArchivedAt: new Date() });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task_overdue" }),
    );
  });

  // N10: Overdue task with deletedAt set -> NOT dispatched
  it("n10: skips overdue deleted task", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: -1, taskDeletedAt: new Date() });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task_overdue" }),
    );
  });

  // N11: Overdue task on deleted board -> NOT dispatched
  it("n11: skips overdue task on deleted board", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: -1, boardDeletedAt: new Date() });

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task_overdue" }),
    );
  });

  // N12: Task with no dueDate -> NOT dispatched
  it("n12: skips task with no dueDate", async () => {
    const db = createDb(typedEnv);
    await setupNotificationData(db, {}); // no dueDateOffsetDays

    await handleScheduled(typedEnv);

    expect(dispatchNotificationEmail).not.toHaveBeenCalled();
  });

  // N13: Console.log summary with sent/failed/skipped at end of run
  it("n13: logs sent/failed/skipped summary after cron run", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const db = createDb(typedEnv);
    await setupNotificationData(db, { dueDateOffsetDays: 1, dueDateEmailSent: false });

    await handleScheduled(typedEnv);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[scheduled-notifications\].*sent=.*failed=.*skipped=/),
    );
  });

  // N14: Individual task dispatch failure does not stop remaining dispatches
  it("n14: single dispatch failure does not abort remaining emails", async () => {
    const db = createDb(typedEnv);
    // Create two approaching tasks
    await setupNotificationData(db, { dueDateOffsetDays: 1, dueDateEmailSent: false });

    // Create second user + task
    const [workspace2] = await db.insert(workspaces).values({
      name: "Notif Workspace 2",
      slug: `notif-ws2-${crypto.randomUUID().slice(0, 8)}`,
      ownerId: "sys_user2",
    }).returning();

    await db.insert(users).values([
      { id: "sys_user2", email: "sysuser2@example.com", workspaceId: workspace2.id, role: "workspace_admin" },
      { id: "assignee_user2", email: "assignee2@example.com", workspaceId: workspace2.id, role: "member" },
    ]);
    await db.insert(workspaceMembers).values([
      { workspaceId: workspace2.id, userId: "sys_user2", role: "admin" },
      { workspaceId: workspace2.id, userId: "assignee_user2", role: "member" },
    ]);
    const [board2] = await db.insert(boards).values({
      workspaceId: workspace2.id,
      name: "Board 2",
      color: "#000000",
      visibility: "workspace",
      createdById: "sys_user2",
      position: 0,
    }).returning();
    await db.insert(boardMembers).values({ boardId: board2.id, userId: "sys_user2", role: "admin" });
    const [col2] = await db.insert(columns).values({
      boardId: board2.id,
      name: "To Do",
      position: 0,
      isDefault: true,
      isDoneColumn: false,
    }).returning();
    const nowUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const [task2] = await db.insert(tasks).values({
      workspaceId: workspace2.id,
      boardId: board2.id,
      columnId: col2.id,
      title: "Task 2",
      dueDate: new Date(nowUtc + 1 * 24 * 60 * 60 * 1000),
      position: 0,
      createdById: "sys_user2",
    }).returning();
    await db.insert(taskAssignees).values({ taskId: task2.id, userId: "assignee_user2", dueDateEmailSent: false });

    // First dispatch throws, second should still be called
    const mockDispatch = vi.mocked(dispatchNotificationEmail);
    mockDispatch
      .mockRejectedValueOnce(new Error("Email failed"))
      .mockResolvedValueOnce(undefined);

    await handleScheduled(typedEnv);

    // Despite the first failure, dispatch was attempted twice
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  // N15: Soft cap of 200 - 201st task is skipped with console.warn
  it("n15: enforces soft cap of 200 emails and logs warning", { timeout: 30000 }, async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn");
    const db = createDb(typedEnv);

    // Create 201 tasks all due tomorrow
    const nowUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const tomorrowDate = new Date(nowUtc + 1 * 24 * 60 * 60 * 1000);

    // Create a single workspace/board/column to hold all tasks
    const [ws] = await db.insert(workspaces).values({
      name: "Big Workspace",
      slug: "big-ws",
      ownerId: "owner_cap",
    }).returning();

    await db.insert(users).values({ id: "owner_cap", email: "owner@example.com", workspaceId: ws.id, role: "workspace_admin" });
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: "owner_cap", role: "admin" });

    const [brd] = await db.insert(boards).values({
      workspaceId: ws.id,
      name: "Cap Board",
      color: "#000",
      visibility: "workspace",
      createdById: "owner_cap",
      position: 0,
    }).returning();
    await db.insert(boardMembers).values({ boardId: brd.id, userId: "owner_cap", role: "admin" });

    const [col] = await db.insert(columns).values({
      boardId: brd.id,
      name: "To Do",
      position: 0,
      isDefault: true,
      isDoneColumn: false,
    }).returning();

    // Insert 201 users + tasks + assignees
    for (let i = 0; i < 201; i++) {
      const uid = `cap_user_${i}`;
      await db.insert(users).values({ id: uid, email: `cap${i}@example.com`, workspaceId: ws.id, role: "member" });
      await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: uid, role: "member" });
      const [t] = await db.insert(tasks).values({
        workspaceId: ws.id,
        boardId: brd.id,
        columnId: col.id,
        title: `Task ${i}`,
        dueDate: tomorrowDate,
        position: i,
        createdById: "owner_cap",
      }).returning();
      await db.insert(taskAssignees).values({ taskId: t.id, userId: uid, dueDateEmailSent: false });
    }

    await handleScheduled(typedEnv);

    // Warn should have been called about cap
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[scheduled-notifications\].*soft cap/i),
    );

    // Exactly 200 dispatches (201st is skipped)
    expect(dispatchNotificationEmail).toHaveBeenCalledTimes(200);
  });
});
