/* eslint-disable ts/no-redeclare */
import createRouter from "@/api/lib/create-router";

import type { AppOpenAPI } from "../lib/types";

import { BASE_PATH } from "../lib/constants";
import index from "./index.route";
import user from "./user/user.index";

export function registerRoutes(app: AppOpenAPI) {
  return app
    .route("/", index)
    .route("/users", user);
}

// stand alone router type used for api client
export const router = registerRoutes(
  createRouter().basePath(BASE_PATH),
);
export type router = typeof router;
