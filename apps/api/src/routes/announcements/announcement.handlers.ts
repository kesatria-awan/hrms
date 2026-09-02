import { desc, eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { announcements, users } from "@/api/db/schema";

import type { CreateAnnouncementRoute, ListAnnouncementsRoute } from "./announcement.routes";

export const listAnnouncements: AppRouteHandler<ListAnnouncementsRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const rows = await db
    .select({
      id: announcements.id,
      workspaceId: announcements.workspaceId,
      authorId: announcements.authorId,
      title: announcements.title,
      body: announcements.body,
      createdAt: announcements.createdAt,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      authorEmail: users.email,
      authorImageUrl: users.imageUrl,
    })
    .from(announcements)
    .innerJoin(users, eq(announcements.authorId, users.id))
    .where(eq(announcements.workspaceId, workspaceId))
    .orderBy(desc(announcements.createdAt))
    .limit(20);

  const result = rows.map(row => ({
    id: row.id,
    workspaceId: row.workspaceId,
    authorId: row.authorId,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: {
      firstName: row.authorFirstName,
      lastName: row.authorLastName,
      email: row.authorEmail,
      imageUrl: row.authorImageUrl,
    },
  }));

  return c.json(result, HttpStatusCodes.OK);
};

export const createAnnouncement: AppRouteHandler<CreateAnnouncementRoute> = async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");
  const workspaceRole = c.get("workspaceRole");

  if (!userId || !workspaceId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  if (workspaceRole !== "owner" && workspaceRole !== "admin") {
    return c.json({ message: "Forbidden" }, HttpStatusCodes.FORBIDDEN);
  }

  const { title, body } = c.req.valid("json");
  const db = createDb(c.env);

  const [announcement] = await db.insert(announcements).values({
    workspaceId,
    authorId: userId,
    title,
    body: body ?? null,
  }).returning();

  const [author] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      imageUrl: users.imageUrl,
    })
    .from(users)
    .where(eq(users.id, userId));

  return c.json({
    id: announcement.id,
    workspaceId: announcement.workspaceId,
    authorId: announcement.authorId,
    title: announcement.title,
    body: announcement.body,
    createdAt: announcement.createdAt.toISOString(),
    author: {
      firstName: author.firstName,
      lastName: author.lastName,
      email: author.email,
      imageUrl: author.imageUrl,
    },
  }, HttpStatusCodes.CREATED);
};
