import { and, eq, gt } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { AppRouteHandler } from "@/api/lib/types";
import type { LogoutRoute, MeRoute, RefreshRoute, RequestOtpRoute, VerifyOtpRoute } from "./auth.routes";

import { createDb } from "@/api/db";
import { refreshTokens, users } from "@/api/db/schema";
import { sendEmail } from "@/api/lib/email";
import { signAccessToken } from "@/api/lib/jwt";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
// OTP allowed only for KA staff domains
const ALLOWED_EMAIL_DOMAINS = ["kesatria.my"];

function isAllowedEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function generateOtp(): string {
  // crypto random 6-digit, no leading-zero bias issues (pad manually)
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function buildOtpEmailHtml(code: string): string {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
    <h2 style="color:#B8860B;">KA HRMS</h2>
    <p>Your login code:</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:700;background:#FFF8DC;padding:16px;text-align:center;border-radius:8px;">${code}</p>
    <p style="color:#666;">This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, ignore this email.</p>
    <p style="color:#999;font-size:12px;">Kesatria Awan Sdn Bhd — HRMS</p>
  </div>`;
}

export const requestOtp: AppRouteHandler<RequestOtpRoute> = async (c) => {
  const { email } = c.req.valid("json");
  const normalizedEmail = email.toLowerCase().trim();

  if (!isAllowedEmail(normalizedEmail)) {
    return c.json({ message: "Only @kesatria.my emails can log in" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  // Rate limit: 60s between sends
  if (user?.otpLastSentAt) {
    const elapsed = (Date.now() - user.otpLastSentAt.getTime()) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return c.json({ message: "Too many requests — wait before retrying" }, HttpStatusCodes.TOO_MANY_REQUESTS);
    }
  }

  const code = generateOtp();
  const hashed = await hashToken(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  if (user) {
    await db.update(users)
      .set({ otpHash: hashed, otpExpiresAt: expiresAt, otpAttempts: 0, otpLastSentAt: new Date() })
      .where(eq(users.id, user.id));
  } else {
    await db.insert(users).values({
      email: normalizedEmail,
      otpHash: hashed,
      otpExpiresAt: expiresAt,
      otpLastSentAt: new Date(),
    });
  }

  try {
    await sendEmail(c.env, {
      to: { email: normalizedEmail },
      subject: `KA HRMS login code: ${code}`,
      htmlContent: buildOtpEmailHtml(code),
    });
  } catch (err) {
    console.error("OTP email send failed:", err);
    return c.json({ message: "Failed to send OTP email" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }

  const response: { message: string; devCode?: string } = {
    message: "OTP sent to your email",
  };
  if (c.env.E2E_MODE === "true") {
    response.devCode = code;
  }
  return c.json(response, HttpStatusCodes.OK);
};

export const verifyOtp: AppRouteHandler<VerifyOtpRoute> = async (c) => {
  const { email, code } = c.req.valid("json");
  const normalizedEmail = email.toLowerCase().trim();

  const db = createDb(c.env);
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  if (!user?.otpHash || !user.otpExpiresAt || user.otpExpiresAt.getTime() < Date.now()) {
    return c.json({ message: "Invalid or expired code" }, HttpStatusCodes.UNAUTHORIZED);
  }

  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return c.json({ message: "Too many attempts — request a new code" }, HttpStatusCodes.TOO_MANY_REQUESTS);
  }

  const hashed = await hashToken(code);
  if (hashed !== user.otpHash) {
    await db.update(users).set({ otpAttempts: (user.otpAttempts ?? 0) + 1 }).where(eq(users.id, user.id));
    return c.json({ message: "Invalid or expired code" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const isNewUser = !user.emailVerifiedAt;
  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email, role: user.role, emailVerifiedAt: (user.emailVerifiedAt?.getTime()) ?? null },
    c.env.JWT_SECRET,
  );

  const refreshToken = crypto.randomUUID();
  const rtHash = await hashToken(refreshToken);
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: rtHash,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000), // 30 days
  });

  // Clear OTP + mark verified + update login time
  await db.update(users).set({
    otpHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    lastLoginAt: new Date(),
  }).where(eq(users.id, user.id));

  return c.json({
    accessToken,
    refreshToken,
    isNewUser,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  }, HttpStatusCodes.OK);
};

export const refresh: AppRouteHandler<RefreshRoute> = async (c) => {
  const { refreshToken } = c.req.valid("json");
  const db = createDb(c.env);
  const rtHash = await hashToken(refreshToken);

  const [row] = await db.select().from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, rtHash), gt(refreshTokens.expiresAt, new Date())))
    .limit(1);

  if (!row || row.revokedAt) {
    return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.deletedAt) {
    return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email, role: user.role, emailVerifiedAt: (user.emailVerifiedAt?.getTime()) ?? null },
    c.env.JWT_SECRET,
  );

  return c.json({ accessToken }, HttpStatusCodes.OK);
};

export const logout: AppRouteHandler<LogoutRoute> = async (c) => {
  const { refreshToken } = c.req.valid("json");
  const db = createDb(c.env);
  const rtHash = await hashToken(refreshToken);

  await db.update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, rtHash));

  return c.json({ message: "Logged out" }, HttpStatusCodes.OK);
};

export const me: AppRouteHandler<MeRoute> = async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      employeeId: user.employeeId,
    },
  }, HttpStatusCodes.OK);
};