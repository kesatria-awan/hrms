import { describe, expect, it } from "vitest";

import { decryptStateCookie, encryptStateCookie, generatePkce } from "./oauth-crypto";

describe("oauth-crypto", () => {
  describe("generatePkce", () => {
    it("returns codeVerifier and codeChallenge", async () => {
      const { codeVerifier, codeChallenge } = await generatePkce();
      expect(codeVerifier).toBeDefined();
      expect(codeChallenge).toBeDefined();
    });

    it("codeVerifier is 43+ chars base64url", async () => {
      const { codeVerifier } = await generatePkce();
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeVerifier).toMatch(/^[\w-]+$/);
    });

    it("codeChallenge is base64url(SHA-256(codeVerifier))", async () => {
      const { codeChallenge } = await generatePkce();
      // codeChallenge must be base64url (no +, /, or =)
      expect(codeChallenge).toMatch(/^[\w-]+$/);
      // SHA-256 produces 32 bytes -> 43 base64url chars (no padding)
      expect(codeChallenge.length).toBe(43);
    });

    it("generates unique values each call", async () => {
      const a = await generatePkce();
      const b = await generatePkce();
      expect(a.codeVerifier).not.toBe(b.codeVerifier);
      expect(a.codeChallenge).not.toBe(b.codeChallenge);
    });
  });

  describe("encryptStateCookie", () => {
    it("returns non-empty base64url string", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const result = await encryptStateCookie({ state: "abc123", codeVerifier: "xyz789" }, secret);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("output contains only base64url characters (no +, /, or =)", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const result = await encryptStateCookie({ state: "abc123", codeVerifier: "xyz789" }, secret);
      expect(result).toMatch(/^[\w-]+$/);
    });

    it("produces different ciphertext each call (random IV)", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const payload = { state: "abc123", codeVerifier: "xyz789" };
      const a = await encryptStateCookie(payload, secret);
      const b = await encryptStateCookie(payload, secret);
      expect(a).not.toBe(b);
    });
  });

  describe("decryptStateCookie", () => {
    it("round-trip: decrypt produces the original payload", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const payload = { state: "my-state-value", codeVerifier: "my-code-verifier" };
      const encrypted = await encryptStateCookie(payload, secret);
      const decrypted = await decryptStateCookie(encrypted, secret);
      expect(decrypted).toEqual(payload);
    });

    it("returns null with wrong secret (does not throw)", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const wrongSecret = "wrong-secret-value-minimum-32-characters-long";
      const encrypted = await encryptStateCookie({ state: "abc", codeVerifier: "xyz" }, secret);
      const result = await decryptStateCookie(encrypted, wrongSecret);
      expect(result).toBeNull();
    });

    it("returns null with corrupted data (does not throw)", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const result = await decryptStateCookie("this-is-not-valid-ciphertext", secret);
      expect(result).toBeNull();
    });

    it("returns null with empty string (does not throw)", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const result = await decryptStateCookie("", secret);
      expect(result).toBeNull();
    });

    it("returns null with truncated ciphertext (does not throw)", async () => {
      const secret = "test-jwt-secret-minimum-32-characters-long";
      const encrypted = await encryptStateCookie({ state: "abc", codeVerifier: "xyz" }, secret);
      // Truncate to trigger decryption failure
      const truncated = encrypted.slice(0, 10);
      const result = await decryptStateCookie(truncated, secret);
      expect(result).toBeNull();
    });
  });
});
