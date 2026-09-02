/**
 * OAuth PKCE and state cookie encryption utilities.
 * Uses Web Crypto API exclusively — compatible with Cloudflare Workers runtime.
 */

// ─── Base64url helpers ──────────────────────────────────────────────────────

/**
 * Converts a Uint8Array to base64url encoding (no padding, URL-safe chars).
 */
export function base64url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Inverse of base64url — decodes a base64url string to Uint8Array.
 */
export function base64urlDecode(str: string): Uint8Array {
  // Add padding back if needed
  const padded = str
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = padded.length % 4;
  const padded2 = pad === 0 ? padded : padded + "=".repeat(4 - pad);
  const binary = atob(padded2);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── PKCE generation ────────────────────────────────────────────────────────

/**
 * Generates a PKCE code_verifier and code_challenge pair.
 * - codeVerifier: 32 random bytes -> base64url (43 chars, URL-safe)
 * - codeChallenge: base64url(SHA-256(codeVerifier))
 */
export async function generatePkce(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const codeVerifier = base64url(randomBytes);

  const encoded = new TextEncoder().encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const codeChallenge = base64url(new Uint8Array(hashBuffer));

  return { codeVerifier, codeChallenge };
}

// ─── AES-GCM key derivation ─────────────────────────────────────────────────

/**
 * Derives an AES-GCM-256 key from a high-entropy secret using PBKDF2.
 * iterations=1 is intentional: this is NOT password hashing — the secret
 * is a high-entropy JWT_SECRET, not a user password.
 */
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("google_oauth_state_v1"),
      iterations: 1,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── State cookie encryption ─────────────────────────────────────────────────

/**
 * Encrypts an OAuth state payload into a base64url string.
 * Format: base64url(iv || ciphertext) where iv is 12 random bytes.
 */
export async function encryptStateCookie(
  payload: { state: string; codeVerifier: string },
  secret: string,
): Promise<string> {
  const key = await deriveAesKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  // Concatenate iv (12 bytes) + ciphertext
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);

  return base64url(combined);
}

/**
 * Decrypts an OAuth state cookie.
 * Returns the original payload, or null on any failure (bad key, corrupted data, etc.).
 */
export async function decryptStateCookie(
  encrypted: string,
  secret: string,
): Promise<{ state: string; codeVerifier: string } | null> {
  try {
    if (!encrypted)
      return null;

    const combined = base64urlDecode(encrypted);
    if (combined.length < 13)
      return null; // Need at least 12 byte IV + 1 byte ciphertext

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await deriveAesKey(secret);
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    const plaintext = new TextDecoder().decode(plaintextBuffer);
    const parsed: unknown = JSON.parse(plaintext);

    if (
      typeof parsed === "object"
      && parsed !== null
      && "state" in parsed
      && "codeVerifier" in parsed
      && typeof (parsed as Record<string, unknown>).state === "string"
      && typeof (parsed as Record<string, unknown>).codeVerifier === "string"
    ) {
      return {
        state: (parsed as Record<string, string>).state,
        codeVerifier: (parsed as Record<string, string>).codeVerifier,
      };
    }

    return null;
  }
  catch {
    return null;
  }
}
