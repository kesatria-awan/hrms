import { jwtVerify, SignJWT } from "jose";

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  emailVerifiedAt: number | null;
};

function getKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  payload: JwtPayload,
  secret: string,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" }) // explicit alg pin
    .setIssuedAt()
    .setExpirationTime("15m") // 15 minute access token TTL
    .sign(getKey(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret), {
      algorithms: ["HS256"], // CRITICAL — reject alg:none
    });
    return payload as unknown as JwtPayload;
  }
  catch {
    return null;
  }
}