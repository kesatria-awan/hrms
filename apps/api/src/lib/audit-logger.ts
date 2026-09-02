import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "@/api/db/schema";
import type { AuditAction, AuditResourceType } from "@/api/db/schema";

import { auditLogs } from "@/api/db/schema";

export type LogAdminActionParams = {
  db: DrizzleD1Database<typeof schema>;
  actorId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  workspaceId?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Log an admin action to the audit trail.
 * Audit logs are immutable - no deletion allowed.
 */
export async function logAdminAction(
  params: LogAdminActionParams,
): Promise<void> {
  const {
    db,
    actorId,
    action,
    resourceType,
    workspaceId,
    resourceId,
    metadata,
    ipAddress,
    userAgent,
  } = params;

  await db.insert(auditLogs).values({
    actorId,
    action,
    resourceType,
    workspaceId: workspaceId ?? null,
    resourceId: resourceId ?? null,
    metadata: metadata ?? null,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });
}

/**
 * Extract client info from Hono context for audit logging.
 * Handles various header formats for client IP detection.
 */
export function getClientInfo(c: {
  req: { header: (name: string) => string | undefined };
}): { ipAddress: string | null; userAgent: string | null } {
  // Try Cloudflare's header first, then x-forwarded-for
  const cfIp = c.req.header("cf-connecting-ip");
  const xForwardedFor = c.req.header("x-forwarded-for");

  let ipAddress: string | null = null;

  if (cfIp) {
    ipAddress = cfIp;
  }
  else if (xForwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    ipAddress = xForwardedFor.split(",")[0]?.trim() || null;
  }

  const userAgent = c.req.header("user-agent") || null;

  return { ipAddress, userAgent };
}
