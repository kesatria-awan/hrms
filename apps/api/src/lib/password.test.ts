import { describe, expect, it } from "vitest";

import type { PasswordHasher } from "./password";

import { hashPassword, PASSWORD_HASHERS, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("returns an object with hash string and hasher equal to pbkdf2-v1", async () => {
    const result = await hashPassword("mypassword");
    expect(typeof result.hash).toBe("string");
    expect(result.hasher).toBe("pbkdf2-v1");
  });

  it("hash format is saltHex:hashHex where saltHex is 32 chars and hashHex is 64 chars", async () => {
    const result = await hashPassword("mypassword");
    const parts = result.hash.split(":");
    expect(parts).toHaveLength(2);
    const [saltHex, hashHex] = parts;
    expect(saltHex).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(hashHex).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it("produces different hashes for same input due to random salt", async () => {
    const result1 = await hashPassword("samepassword");
    const result2 = await hashPassword("samepassword");
    expect(result1.hash).not.toBe(result2.hash);
  });
});

describe("verifyPassword", () => {
  it("returns true for matching password", async () => {
    const { hash, hasher } = await hashPassword("correctpassword");
    const result = await verifyPassword("correctpassword", hash, hasher);
    expect(result).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const { hash, hasher } = await hashPassword("correctpassword");
    const result = await verifyPassword("wrongpassword", hash, hasher);
    expect(result).toBe(false);
  });

  it("throws for hasher=bcrypt with message containing 'bcrypt verification not yet implemented'", async () => {
    const { hash } = await hashPassword("somepassword");
    await expect(verifyPassword("somepassword", hash, "bcrypt")).rejects.toThrow(
      "bcrypt verification not yet implemented",
    );
  });

  it("throws for unknown hasher with message containing 'Unknown password hasher'", async () => {
    const { hash } = await hashPassword("somepassword");
    await expect(verifyPassword("somepassword", hash, "unknown-hasher")).rejects.toThrow(
      "Unknown password hasher",
    );
  });
});

describe("pASSWORD_HASHERS", () => {
  it("contains pbkdf2-v1 and bcrypt", () => {
    expect(PASSWORD_HASHERS).toContain("pbkdf2-v1");
    expect(PASSWORD_HASHERS).toContain("bcrypt");
  });

  it("passwordHasher type covers all hashers in PASSWORD_HASHERS array", () => {
    // Type-level check — if this compiles, the type is correct
    const hasher: PasswordHasher = "pbkdf2-v1";
    expect(hasher).toBe("pbkdf2-v1");
  });
});
