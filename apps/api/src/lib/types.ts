import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { PinoLogger } from "hono-pino";

import type { BASE_PATH } from "./constants";

export type AppEnv = {
  Bindings: {
    AUTH_SECRET: string;
    LOG_LEVEL: string;
    NODE_ENV: string;
    ASSETS: Fetcher;
    DB: D1Database;
  };
  Variables: {
    logger: PinoLogger;
  };
};

// eslint-disable-next-line ts/no-empty-object-type
export type AppOpenAPI = OpenAPIHono<AppEnv, {}, typeof BASE_PATH>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppEnv>;
