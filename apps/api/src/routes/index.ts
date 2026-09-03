import createRouter from "@/api/lib/create-router";

import type { AppOpenAPI } from "../lib/types";

import { BASE_PATH } from "../lib/constants";
import attachments from "./attachments/attachment.index";
import auth from "./auth/auth.index";
import notificationPreferences from "./notification-preferences/notification-preferences.index";
import notifications from "./notifications/notification.index";
import user from "./user/user.index";
import index from "./index.route";

export function registerRoutes(app: AppOpenAPI) {
  return app
    .route("/", index)
    .route("/auth", auth)
    .route("/users", user)
    .route("/", attachments)
    .route("/", notifications)
    .route("/", notificationPreferences);
}

// stand alone router type used for api client
export const router = registerRoutes(
  createRouter().basePath(BASE_PATH),
);
export type router = typeof router;