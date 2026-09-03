import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { PinoLogger } from "hono-pino";

import type { UserRole } from "../db/schema";
import type { BASE_PATH } from "./constants";

export type AppEnv = {
  Bindings: {
    AUTH_SECRET: string;
    LOG_LEVEL: string;
    NODE_ENV: string;
    ASSETS: Fetcher;
    DB: D1Database;
    JWT_SECRET: string;
    // Email (OTP via mailcow relay on KawanPro-VM)
    EMAIL_PROVIDER?: string; // "mailcow-relay" | "log"
    MAIL_RELAY_URL?: string;
    MAIL_RELAY_API_KEY?: string;
    // Frontend URL for redirects
    FRONTEND_URL?: string;
    // E2E testing mode: returns OTP in response
    E2E_MODE?: string;
    // R2 Storage (documents, payslips, receipts, avatars)
    R2_BUCKET: R2Bucket;
  };
  Variables: {
    logger: PinoLogger;
    userId: string;
    userEmail: string;
    userRole: UserRole;
    emailVerifiedAt: number | null;
  };
};

// eslint-disable-next-line ts/no-empty-object-type
export type AppOpenAPI = OpenAPIHono<AppEnv, {}, typeof BASE_PATH>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppEnv>;

export type AuthContext = {
  userId: string;
  userEmail: string;
  userRole: UserRole;
};