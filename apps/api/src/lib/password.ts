export const PASSWORD_HASHERS = ["pbkdf2-v1", "bcrypt"] as const;
export type PasswordHasher = (typeof PASSWORD_HASHERS)[number];

const PBKDF2_ITERATIONS = 100_000; // D-19: Workers ceiling
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

export async function hashPassword(plain: string): Promise<{ hash: string; hasher: "pbkdf2-v1" }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const key = await derivePbkdf2Key(plain, salt);
  return {
    hash: `${toHex(salt)}:${toHex(key)}`,
    hasher: "pbkdf2-v1",
  };
}

export async function verifyPassword(
  plain: string,
  stored: string,
  hasher: string,
): Promise<boolean> {
  if (hasher === "pbkdf2-v1") {
    const [saltHex, hashHex] = stored.split(":");
    const salt = fromHex(saltHex);
    const expectedKey = fromHex(hashHex);
    const actualKey = await derivePbkdf2Key(plain, salt);
    return timingSafeCompare(actualKey, expectedKey); // Pitfall 4 fix
  }
  if (hasher === "bcrypt") {
    throw new Error("bcrypt verification not yet implemented");
  }
  throw new Error(`Unknown password hasher: ${hasher}`);
}

async function derivePbkdf2Key(plain: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(plain),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
