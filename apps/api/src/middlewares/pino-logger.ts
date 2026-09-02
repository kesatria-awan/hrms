import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "hono-pino";

// import { requestId } from 'hono/request-id'
import { pinoLogger as logger } from "hono-pino";
// import { randomUUID } from "node:crypto";
import pino from "pino";

import type { AppEnv } from "@/api/lib/types";

// Custom formatter for development logs (works in Workers runtime)
function formatLogForDev(obj: Record<string, unknown>): string {
  const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  const level = String(obj.level || "");
  const msg = String(obj.msg || "");

  // Level colors (ANSI codes)
  const levelColors: Record<string, string> = {
    10: "\x1B[90m", // trace - gray
    20: "\x1B[36m", // debug - cyan
    30: "\x1B[32m", // info - green
    40: "\x1B[33m", // warn - yellow
    50: "\x1B[31m", // error - red
    60: "\x1B[35m", // fatal - magenta
  };

  const levelNames: Record<string, string> = {
    10: "TRACE",
    20: "DEBUG",
    30: "INFO ",
    40: "WARN ",
    50: "ERROR",
    60: "FATAL",
  };

  const reset = "\x1B[0m";
  const gray = "\x1B[90m";
  const cyan = "\x1B[36m";

  const color = levelColors[level] || "";
  const levelName = levelNames[level] || "INFO ";

  let output = `${gray}[${timestamp}]${reset} ${color}${levelName}${reset} ${msg}`;

  // Add request info if available
  if (obj.req && typeof obj.req === "object") {
    const req = obj.req as Record<string, unknown>;
    output += ` ${cyan}| ${req.method} ${req.url}${reset}`;
  }

  // Add event info
  if (obj.event) {
    output += ` ${gray}[${obj.event}]${reset}`;
  }

  // Add user info
  if (obj.userId) {
    output += ` 👤 ${obj.userId}`;
  }
  if (obj.email) {
    output += ` 📧 ${obj.email}`;
  }
  if (obj.ip) {
    output += ` 🌐 ${obj.ip}`;
  }

  // Add error code if present
  if (obj.errorCode) {
    output += ` ⚠ ${obj.errorCode}`;
  }

  return output;
}

export function pinoLogger() {
  return ((c, next) => {
    const reqId
      = c.req.header("cf-ray")
        || c.req.header("x-request-id")
      // eslint-disable-next-line no-restricted-globals
        || (typeof self !== "undefined" && self.crypto?.randomUUID?.())
        || (typeof crypto !== "undefined" && crypto.randomUUID?.())
        || "unknown";

    const isDevelopment = c.env.NODE_ENV === "development" || c.env.NODE_ENV === "dev";

    return logger({
      pino: pino({
        level: c.env.LOG_LEVEL || "info",
        // Ensure a browser-friendly output in Workers
        browser: {
          asObject: !isDevelopment,
          write: isDevelopment
            ? {
              // Custom write functions for each log level
                trace: (obj: object) => {
                // eslint-disable-next-line no-console
                  console.log(formatLogForDev(obj as Record<string, unknown>));
                },
                debug: (obj: object) => {
                // eslint-disable-next-line no-console
                  console.log(formatLogForDev(obj as Record<string, unknown>));
                },
                info: (obj: object) => {
                // eslint-disable-next-line no-console
                  console.log(formatLogForDev(obj as Record<string, unknown>));
                },
                warn: (obj: object) => {
                  console.warn(formatLogForDev(obj as Record<string, unknown>));
                },
                error: (obj: object) => {
                  console.error(formatLogForDev(obj as Record<string, unknown>));
                },
                fatal: (obj: object) => {
                  console.error(formatLogForDev(obj as Record<string, unknown>));
                },
              }
            : undefined,
        },
      }),
      http: {
        reqId: () => reqId,
      },
    })(c as unknown as Context<Env>, next);
  }) satisfies MiddlewareHandler<AppEnv>;
}
