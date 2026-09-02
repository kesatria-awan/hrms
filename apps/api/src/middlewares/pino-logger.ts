import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "hono-pino";

// import { requestId } from 'hono/request-id'
import { pinoLogger as logger } from "hono-pino";
// import { randomUUID } from "node:crypto";
import pino from "pino";

import type { AppEnv } from "@/api/lib/types";

export function pinoLogger() {
  return ((c, next) => {
    const reqId
      = c.req.header("cf-ray")
        || c.req.header("x-request-id")
        // eslint-disable-next-line no-restricted-globals
        || (self.crypto?.randomUUID?.() ?? "unknown");

    return logger({
      pino: pino({
        level: c.env.LOG_LEVEL || "info",
        // Ensure a browser-friendly output in Workers (no Node transports)
        browser: { asObject: true },
      }),
      http: {
        reqId: () => reqId,
      },
    })(c as unknown as Context<Env>, next);
  }) satisfies MiddlewareHandler<AppEnv>;
}
