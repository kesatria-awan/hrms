import { asc, count, eq, inArray } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { boards, columns } from "@/api/db/schema";
import { getBoardAccess } from "@/api/lib/permissions";

import type {
  CreateColumnRoute,
  DeleteColumnRoute,
  ReorderColumnsRoute,
  UpdateColumnRoute,
} from "./column.routes";

const MAX_COLUMNS_PER_BOARD = 7;

export const createColumn: AppRouteHandler<CreateColumnRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { boardId, name, isDoneColumn } = c.req.valid("json");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  // Check board access
  const access = await getBoardAccess({
    db,
    boardId,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canView) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  if (!access.canEdit) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Check column limit
  const [columnCount] = await db
    .select({ count: count() })
    .from(columns)
    .where(eq(columns.boardId, boardId));

  if (columnCount.count >= MAX_COLUMNS_PER_BOARD) {
    return c.json(
      { message: `Maximum of ${MAX_COLUMNS_PER_BOARD} columns per board allowed` },
      HttpStatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  // Get next position
  const existingColumns = await db
    .select({ position: columns.position })
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .orderBy(asc(columns.position));

  const nextPosition
    = existingColumns.length > 0
      ? Math.max(...existingColumns.map(col => col.position)) + 1
      : 0;

  const [column] = await db
    .insert(columns)
    .values({
      boardId,
      name,
      position: nextPosition,
      isDoneColumn: isDoneColumn ?? false,
    })
    .returning();

  c.var.logger?.info({ columnId: column.id, boardId, userId }, "Column created");

  return c.json(column, HttpStatusCodes.CREATED);
};

export const updateColumn: AppRouteHandler<UpdateColumnRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  // Get column to find its board
  const [column] = await db
    .select()
    .from(columns)
    .where(eq(columns.id, id))
    .limit(1);

  if (!column) {
    return c.json({ message: "Column not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check board access
  const access = await getBoardAccess({
    db,
    boardId: column.boardId,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canEdit) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Cannot rename default columns
  if (column.isDefault && body.name) {
    return c.json(
      { message: "Cannot rename default columns" },
      HttpStatusCodes.FORBIDDEN,
    );
  }

  const [updated] = await db
    .update(columns)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(columns.id, id))
    .returning();

  c.var.logger?.info({ columnId: id, userId }, "Column updated");

  return c.json(updated, HttpStatusCodes.OK);
};

export const deleteColumn: AppRouteHandler<DeleteColumnRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { id } = c.req.valid("param");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  // Get column to find its board and check if it's default
  const [column] = await db
    .select()
    .from(columns)
    .where(eq(columns.id, id))
    .limit(1);

  if (!column) {
    return c.json({ message: "Column not found" }, HttpStatusCodes.NOT_FOUND);
  }

  // Check board access
  const access = await getBoardAccess({
    db,
    boardId: column.boardId,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canEdit) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Cannot delete default column
  if (column.isDefault) {
    return c.json(
      { message: "Cannot delete default columns" },
      HttpStatusCodes.FORBIDDEN,
    );
  }

  // TODO: Check if column has tasks (will be implemented in Phase 3)
  // For now, just delete the column

  await db.delete(columns).where(eq(columns.id, id));

  c.var.logger?.info({ columnId: id, boardId: column.boardId, userId }, "Column deleted");

  return c.body(null, HttpStatusCodes.NO_CONTENT);
};

export const reorderColumns: AppRouteHandler<ReorderColumnsRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  const { boardId } = c.req.valid("param");
  const { columnIds } = c.req.valid("json");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  // Check board exists and access
  const [board] = await db
    .select()
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);

  if (!board) {
    return c.json({ message: "Board not found" }, HttpStatusCodes.NOT_FOUND);
  }

  const access = await getBoardAccess({
    db,
    boardId,
    userId,
    workspaceId,
    userWorkspaceRole: c.get("workspaceRole") ?? "user",
  });

  if (!access.canEdit) {
    return c.json({ message: "Access denied" }, HttpStatusCodes.FORBIDDEN);
  }

  // Verify all column IDs belong to this board
  const existingColumns = await db
    .select()
    .from(columns)
    .where(eq(columns.boardId, boardId));

  const existingIds = new Set(existingColumns.map(col => col.id));
  const invalidIds = columnIds.filter(id => !existingIds.has(id));

  if (invalidIds.length > 0) {
    return c.json(
      { message: "Invalid column IDs" },
      HttpStatusCodes.BAD_REQUEST,
    );
  }

  // Update positions
  const updates = columnIds.map((id, index) =>
    db
      .update(columns)
      .set({ position: index, updatedAt: new Date() })
      .where(eq(columns.id, id)),
  );

  await Promise.all(updates);

  // Return updated columns
  const updatedColumns = await db
    .select()
    .from(columns)
    .where(inArray(columns.id, columnIds))
    .orderBy(asc(columns.position));

  c.var.logger?.info({ boardId, userId }, "Columns reordered");

  return c.json(updatedColumns, HttpStatusCodes.OK);
};
