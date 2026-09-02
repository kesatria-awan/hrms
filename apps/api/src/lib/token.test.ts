import { describe, expect, it } from "vitest";

import { hashToken } from "./token";

describe("hashToken", () => {
  it("returns a 64-char hex string", async () => {
    const result = await hashToken("test-input");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces same output", async () => {
    const r1 = await hashToken("test-input");
    const r2 = await hashToken("test-input");
    expect(r1).toBe(r2);
  });

  it("produces different outputs for different inputs", async () => {
    const r1 = await hashToken("a");
    const r2 = await hashToken("b");
    expect(r1).not.toBe(r2);
  });
});
