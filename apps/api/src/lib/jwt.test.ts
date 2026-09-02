import { describe, expect, it } from "vitest";

import type { JwtPayload } from "./jwt";

import { signAccessToken, verifyAccessToken } from "./jwt";

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long";
const OTHER_SECRET = "other-jwt-secret-at-least-32-chars-long";

const testPayload: JwtPayload = {
  sub: "user_123",
  email: "test@example.com",
  role: "member",
  workspaceId: "ws_abc",
  workspaceRole: "user",
  isSuperAdmin: false,
  emailVerifiedAt: null,
};

describe("signAccessToken", () => {
  it("returns a non-empty string", async () => {
    const token = await signAccessToken(testPayload, TEST_SECRET);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("returns a JWT with three dot-separated parts", async () => {
    const token = await signAccessToken(testPayload, TEST_SECRET);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("encodes emailVerifiedAt timestamp into JWT payload", async () => {
    const payload: JwtPayload = { ...testPayload, emailVerifiedAt: 1700000000 };
    const token = await signAccessToken(payload, TEST_SECRET);
    const decoded = await verifyAccessToken(token, TEST_SECRET);
    expect(decoded?.emailVerifiedAt).toBe(1700000000);
  });

  it("encodes emailVerifiedAt=null into JWT payload", async () => {
    const payload: JwtPayload = { ...testPayload, emailVerifiedAt: null };
    const token = await signAccessToken(payload, TEST_SECRET);
    const decoded = await verifyAccessToken(token, TEST_SECRET);
    expect(decoded?.emailVerifiedAt).toBeNull();
  });
});

describe("verifyAccessToken", () => {
  it("decodes a token signed by signAccessToken with correct payload", async () => {
    const token = await signAccessToken(testPayload, TEST_SECRET);
    const decoded = await verifyAccessToken(token, TEST_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe(testPayload.sub);
    expect(decoded?.email).toBe(testPayload.email);
    expect(decoded?.role).toBe(testPayload.role);
    expect(decoded?.workspaceId).toBe(testPayload.workspaceId);
    expect(decoded?.workspaceRole).toBe(testPayload.workspaceRole);
    expect(decoded?.isSuperAdmin).toBe(testPayload.isSuperAdmin);
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await signAccessToken(testPayload, TEST_SECRET);
    const decoded = await verifyAccessToken(token, OTHER_SECRET);
    expect(decoded).toBeNull();
  });

  it("returns null for a garbage string", async () => {
    const decoded = await verifyAccessToken("not.a.jwt", TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it("returns null for an empty string", async () => {
    const decoded = await verifyAccessToken("", TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it("returns null for a token with a manipulated alg header (alg:none)", async () => {
    // Craft a fake token claiming alg:none
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const payloadPart = btoa(JSON.stringify({ sub: "attacker", email: "x@x.com", role: "super_admin" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const fakeToken = `${header}.${payloadPart}.`;
    const decoded = await verifyAccessToken(fakeToken, TEST_SECRET);
    expect(decoded).toBeNull();
  });
});
