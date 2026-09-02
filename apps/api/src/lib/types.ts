import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { PinoLogger } from "hono-pino";

import type { UserRole, WorkspaceMemberRole } from "../db/schema";
import type { BASE_PATH } from "./constants";

export type AppEnv = {
  Bindings: {
    AUTH_SECRET: string;
    LOG_LEVEL: string;
    NODE_ENV: string;
    ASSETS: Fetcher;
    DB: D1Database;
    // Auth secrets (set via `wrangler secret put`)
    JWT_SECRET: string;
    BREVO_API_KEY: string;
    BREVO_WEBHOOK_SECRET: string;
    // SecureMail provider (optional — only needed when EMAIL_PROVIDER=securemail)
    SECUREMAIL_API_KEY?: string;
    // Email provider selection: "brevo" | "securemail" (defaults to "brevo")
    EMAIL_PROVIDER?: string;
    // Google OAuth
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    // Frontend URL for redirects (invitation acceptance, etc.)
    FRONTEND_URL?: string;
    // E2E testing mode: auto-verifies users and exposes invite rawToken
    E2E_MODE?: string;
    // CHIP payment gateway
    CHIP_API_KEY: string;
    CHIP_BRAND_ID: string;
    // R2 Storage (native binding)
    R2_BUCKET: R2Bucket;
    // Cloudflare Images binding for server-side resize (Phase 06)
    IMAGES: {
      input: (stream: ReadableStream) => {
        transform: (opts: { width: number; height: number; fit?: string }) => {
          output: (opts: { format: string }) => Promise<{ body: ReadableStream }>;
        };
      };
    };
  };
  Variables: {
    logger: PinoLogger;
    // Auth context (set by jwt-auth middleware)
    userId: string;
    userEmail: string;
    userRole: UserRole;
    workspaceId: string | null;
    // User's role in the current workspace (from workspace_members table)
    workspaceRole: WorkspaceMemberRole | null;
    // Whether user is a platform-level super admin
    isSuperAdmin: boolean;
    // Unix timestamp (ms) when email was verified; null if unverified
    emailVerifiedAt: number | null;
  };
};

// eslint-disable-next-line ts/no-empty-object-type
export type AppOpenAPI = OpenAPIHono<AppEnv, {}, typeof BASE_PATH>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppEnv>;

// Auth context type for convenience
export type AuthContext = {
  userId: string;
  userEmail: string;
  userRole: UserRole;
  workspaceId: string | null;
};
