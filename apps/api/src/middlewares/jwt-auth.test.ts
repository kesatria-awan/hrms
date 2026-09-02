import type { MiddlewareHandler } from "hono";

import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AppEnv } from "@/api/lib/types";

import { signAccessToken } from "@/api/lib/jwt";

import { jwtAuth, optionalJwtAuth } from "./jwt-auth";

const TEST_SECRET = "test-jwt-secret-minimum-32-characters-long";

function createTestApp(middleware: MiddlewareHandler<AppEnv>) {
  const app = new Hono<AppEnv>();
  app.use("/*", middleware);
  app.get("/test", c => c.json({
    userId: c.get("userId"),
    userEmail: c.get("userEmail"),
    userRole: c.get("userRole"),
    workspaceId: c.get("workspaceId"),
    workspaceRole: c.get("workspaceRole"),
    isSuperAdmin: c.get("isSuperAdmin"),
  }));
  return app;
}

const validPayload = {
  sub: "user-123",
  email: "test@example.com",
  role: "member" as const,
  workspaceId: "ws-456",
  workspaceRole: "user" as const,
  isSuperAdmin: false,
};

describe("jwtAuth()", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const app = createTestApp(jwtAuth());
    const res = await app.request("/test", {}, env);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });

  it("returns 401 when Authorization header doesn't start with 'Bearer '", async () => {
    const app = createTestApp(jwtAuth());
    const res = await app.request("/test", {
      headers: new Headers({ Authorization: "Basic abc123" }),
    }, env);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });

  it("returns 401 when token is invalid/garbage", async () => {
    const app = createTestApp(jwtAuth());
    const res = await app.request("/test", {
      headers: new Headers({ Authorization: "Bearer garbage-token-that-is-invalid" }),
    }, env);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });

  it("sets context variables from JWT claims when valid token provided", async () => {
    const token = await signAccessToken(validPayload, TEST_SECRET);
    const app = createTestApp(jwtAuth());
    const res = await app.request("/test", {
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(validPayload.sub);
    expect(body.userEmail).toBe(validPayload.email);
    expect(body.userRole).toBe(validPayload.role);
    expect(body.workspaceId).toBe(validPayload.workspaceId);
    expect(body.workspaceRole).toBe(validPayload.workspaceRole);
    expect(body.isSuperAdmin).toBe(validPayload.isSuperAdmin);
  });

  it("skips verification and calls next() when userId is already set (mock auth compatibility)", async () => {
    const app = new Hono<AppEnv>();
    // Pre-set userId to simulate mock auth
    app.use("/*", async (c, next) => {
      c.set("userId", "pre-set-user-id");
      await next();
    });
    app.use("/*", jwtAuth());
    app.get("/test", c => c.json({
      userId: c.get("userId"),
    }));
    const res = await app.request("/test", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("pre-set-user-id");
  });
});

describe("optionalJwtAuth()", () => {
  it("calls next() without error when no Authorization header (does not set context vars)", async () => {
    const app = createTestApp(optionalJwtAuth());
    const res = await app.request("/test", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeUndefined();
    expect(body.userEmail).toBeUndefined();
  });

  it("sets context variables when valid Bearer token is present", async () => {
    const token = await signAccessToken(validPayload, TEST_SECRET);
    const app = createTestApp(optionalJwtAuth());
    const res = await app.request("/test", {
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(validPayload.sub);
    expect(body.userEmail).toBe(validPayload.email);
    expect(body.workspaceId).toBe(validPayload.workspaceId);
  });

  it("calls next() without error when token is invalid (swallows error, does not set context vars)", async () => {
    const app = createTestApp(optionalJwtAuth());
    const res = await app.request("/test", {
      headers: new Headers({ Authorization: "Bearer invalid-garbage-token" }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeUndefined();
  });
});
