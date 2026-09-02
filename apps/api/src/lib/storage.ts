import { and, eq, sql } from "drizzle-orm";

import { workspaces } from "../db/schema";

/**
 * Generate a unique R2 key for an attachment
 * Format: {workspaceId}/{taskId}/{uuid}-{sanitized-filename}
 */
export function generateR2Key(
  workspaceId: string,
  taskId: string,
  fileName: string,
): string {
  const uuid = crypto.randomUUID();
  const sanitizedFileName = sanitizeFileName(fileName);
  return `${workspaceId}/${taskId}/${uuid}-${sanitizedFileName}`;
}

/**
 * Sanitize a file name to be safe for R2 storage
 * - Removes/replaces special characters
 * - Preserves extension
 * - Limits length
 */
export function sanitizeFileName(fileName: string): string {
  // Get the extension
  const lastDot = fileName.lastIndexOf(".");
  const hasExtension = lastDot > 0 && lastDot < fileName.length - 1;
  const extension = hasExtension ? fileName.slice(lastDot) : "";
  const baseName = hasExtension ? fileName.slice(0, lastDot) : fileName;

  // Sanitize the base name
  // - Replace spaces with underscores
  // - Remove any character that's not alphanumeric, underscore, or hyphen
  // - Limit to 100 characters
  const sanitizedBase = baseName
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "")
    .slice(0, 100);

  // If sanitized base is empty, use "file"
  const finalBase = sanitizedBase || "file";

  return finalBase + extension.toLowerCase();
}

/**
 * Check if a workspace has enough storage quota for a file
 */
export async function checkStorageQuota(
  db: ReturnType<typeof import("../db").createDb>,
  workspaceId: string,
  fileSize: number,
): Promise<{ hasQuota: boolean; used: number; quota: number; remaining: number }> {
  const [workspace] = await db
    .select({
      storageUsedBytes: workspaces.storageUsedBytes,
      storageQuotaBytes: workspaces.storageQuotaBytes,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  if (!workspace) {
    return { hasQuota: false, used: 0, quota: 0, remaining: 0 };
  }

  const remaining = workspace.storageQuotaBytes - workspace.storageUsedBytes;
  const hasQuota = fileSize <= remaining;

  return {
    hasQuota,
    used: workspace.storageUsedBytes,
    quota: workspace.storageQuotaBytes,
    remaining,
  };
}

/**
 * Update workspace storage usage
 */
export async function updateStorageUsage(
  db: ReturnType<typeof import("../db").createDb>,
  workspaceId: string,
  deltaBytes: number,
): Promise<void> {
  await db
    .update(workspaces)
    .set({
      storageUsedBytes: sql`${workspaces.storageUsedBytes} + ${deltaBytes}`,
    })
    .where(eq(workspaces.id, workspaceId));
}

/**
 * Atomically reserve storage for a file upload.
 * Uses a conditional UPDATE to prevent race conditions.
 * Only increments storage if the quota would not be exceeded.
 *
 * @returns true if storage was reserved, false if quota would be exceeded
 */
export async function reserveStorage(
  db: ReturnType<typeof import("../db").createDb>,
  workspaceId: string,
  fileSize: number,
): Promise<boolean> {
  // Atomic conditional update: only increment if quota allows
  const result = await db
    .update(workspaces)
    .set({
      storageUsedBytes: sql`${workspaces.storageUsedBytes} + ${fileSize}`,
    })
    .where(
      and(
        eq(workspaces.id, workspaceId),
        sql`${workspaces.storageUsedBytes} + ${fileSize} <= ${workspaces.storageQuotaBytes}`,
      ),
    )
    .returning({ id: workspaces.id });

  // If the update affected a row, storage was reserved successfully
  return result.length > 0;
}
