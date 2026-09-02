/* eslint-disable ts/no-redeclare */
import createRouter from "@/api/lib/create-router";

import type { AppOpenAPI } from "../lib/types";

import { BASE_PATH } from "../lib/constants";
import activities from "./activities/activity.index";
import admin from "./admin/admin.index";
import announcements from "./announcements/announcement.index";
import attachments from "./attachments/attachment.index";
import auth from "./auth/auth.index";
import billing from "./billing/billing.index";
import boards from "./boards/board.index";
import columns from "./columns/column.index";
import comments from "./comments/comment.index";
import index from "./index.route";
import notificationPreferences from "./notification-preferences/notification-preferences.index";
import notifications from "./notifications/notification.index";
import tasks from "./tasks/task.index";
import user from "./user/user.index";
import webhooks from "./webhooks/webhook.index";
import workspaces from "./workspaces/workspace.index";

export function registerRoutes(app: AppOpenAPI) {
  return app
    .route("/", index)
    .route("/auth", auth)
    .route("/users", user)
    .route("/webhooks", webhooks)
    .route("/", workspaces)
    .route("/", boards)
    .route("/", columns)
    .route("/", tasks)
    .route("/", comments)
    .route("/", attachments)
    .route("/", activities)
    .route("/", notifications)
    .route("/", notificationPreferences)
    .route("/", announcements)
    .route("/", billing)
    .route("/", admin);
}

// stand alone router type used for api client
export const router = registerRoutes(
  createRouter().basePath(BASE_PATH),
);
export type router = typeof router;
