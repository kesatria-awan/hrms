import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { requireVerified } from "./require-verified";

function makeApp(emailVerifiedAt: number | null | undefined) {
  const app = new Hono<AppEnv>();
  app.use("/test", async (c, next) => {
    // Simulate jwtAuth setting the context variable
    if (emailVerifiedAt !== undefined) {
      c.set("emailVerifiedAt", emailVerifiedAt);
    }
    await next();
  });
  app.use("/test", requireVerified());
  app.get("/test", c => c.json({ ok: true }, 200));
  return app;
}

describe("requireVerified", () => {
  it("passes through when emailVerifiedAt is a timestamp", async () => {
    const app = makeApp(1700000000);
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 403 with email_not_verified code when emailVerifiedAt is null", async () => {
    const app = makeApp(null);
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json() as { message: string; code: string };
    expect(body.message).toBe("Email not verified");
    expect(body.code).toBe("email_not_verified");
  });

  it("returns 403 when emailVerifiedAt is never set on context", async () => {
    const app = makeApp(undefined);
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json() as { message: string; code: string };
    expect(body.message).toBe("Email not verified");
    expect(body.code).toBe("email_not_verified");
  });
});
