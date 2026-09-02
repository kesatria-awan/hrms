import type { Context } from "hono";

import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as HttpStatusCodes from "stoker/http-status-codes";

import type { JwtPayload } from "@/api/lib/jwt";
import type { AppEnv, AppRouteHandler } from "@/api/lib/types";

import { createDb } from "@/api/db";
import { emailVerifications, passwordResets, refreshTokens, users, workspaceInvitations, workspaceMembers, workspaces } from "@/api/db/schema";
import { sendEmail } from "@/api/lib/email";
import { buildPasswordResetEmail, buildVerificationEmail } from "@/api/lib/email-templates";
import { signAccessToken } from "@/api/lib/jwt";
import { dispatchNotificationEmail } from "@/api/lib/notification-email";
import { decryptStateCookie, encryptStateCookie, generatePkce } from "@/api/lib/oauth-crypto";
import { hashPassword, verifyPassword } from "@/api/lib/password";
import { hashToken } from "@/api/lib/token";

import type { AcceptInviteRoute, ForgotPasswordRoute, GetAvatarRoute, GetInviteRoute, GoogleCallbackRoute, GoogleLoginRoute, LoginRoute, LogoutRoute, MeRoute, MyWorkspacesRoute, RefreshRoute, RegisterRoute, ResendVerificationRoute, ResetPasswordRoute, SignupRoute, SwitchWorkspaceRoute, UpdateProfileRoute, UploadAvatarRoute, VerifyEmailRoute } from "./auth.routes";

export const signup: AppRouteHandler<SignupRoute> = async (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { workspaceName, workspaceSlug } = c.req.valid("json");
  const db = createDb(c.env);

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Check if user already owns a workspace
  const [ownedWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, userId))
    .limit(1);

  if (ownedWorkspace) {
    return c.json(
      { message: "You already own a workspace" },
      HttpStatusCodes.CONFLICT,
    );
  }

  // Check if slug is already taken
  const [existingWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1);

  if (existingWorkspace) {
    return c.json(
      { message: "Workspace slug already taken" },
      HttpStatusCodes.BAD_REQUEST,
    );
  }

  // Create workspace and user in a transaction-like manner
  // Note: D1 doesn't support transactions, so we do this sequentially
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: workspaceName,
      slug: workspaceSlug,
      ownerId: userId,
    })
    .returning();

  // Create or update user record
  let user;
  if (existingUser) {
    // Update existing user with workspace and admin role
    [user] = await db
      .update(users)
      .set({
        workspaceId: workspace.id,
        role: "workspace_admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
  }
  else {
    // Validate email before creating new user
    if (!userEmail || typeof userEmail !== "string") {
      return c.json(
        { message: "Email is required" },
        HttpStatusCodes.BAD_REQUEST,
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return c.json(
        { message: "Invalid email format" },
        HttpStatusCodes.BAD_REQUEST,
      );
    }

    // Create new user record
    [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: userEmail,
        workspaceId: workspace.id,
        role: "workspace_admin",
      })
      .returning();
  }

  // Add creator as workspace owner member
  await db
    .insert(workspaceMembers)
    .values({
      workspaceId: workspace.id,
      userId,
      role: "owner",
    })
    .onConflictDoNothing();

  c.var.logger?.info({ userId, workspaceId: workspace.id }, "Workspace created");

  return c.json(
    { user, workspace },
    HttpStatusCodes.CREATED,
  );
};

export const me: AppRouteHandler<MeRoute> = async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  // ownsWorkspace and canManageBilling will be computed after we know the current workspace
  let ownsWorkspace = false;
  let canManageBilling = false;

  // Get user with workspace
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    // User not yet in database
    return c.json(
      { user: null, workspace: null, ownsWorkspace, canManageBilling },
      HttpStatusCodes.OK,
    );
  }

  // Get workspace if user has one
  let workspace = null;
  if (user.workspaceId) {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, user.workspaceId))
      .limit(1);
    workspace = ws ?? null;

    // Check if user owns the current workspace
    if (workspace) {
      ownsWorkspace = workspace.ownerId === userId;
    }

    // Ensure workspace_members record exists (idempotent)
    const wsMemberRole = user.role === "workspace_admin" ? "admin" as const : "user" as const;
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: user.workspaceId,
        userId: user.id,
        role: wsMemberRole,
      })
      .onConflictDoNothing();
  }

  // Look up billing permission
  if (workspace && user) {
    const [billingMembership] = await db
      .select({ canManageBilling: workspaceMembers.canManageBilling })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, user.id)))
      .limit(1);
    canManageBilling = ownsWorkspace || (billingMembership?.canManageBilling ?? false);
  }

  return c.json(
    { user, workspace, ownsWorkspace, canManageBilling },
    HttpStatusCodes.OK,
  );
};

// ─── Private helpers for custom auth ──────────────────────────────────────

type DbInstance = ReturnType<typeof createDb>;
type UserRecord = { id: string; email: string; role: string; workspaceId: string | null; isSuperAdmin: boolean | null; emailVerifiedAt: Date | null };

async function issueTokens(
  user: UserRecord,
  workspaceRole: string | null,
  db: DbInstance,
  secret: string,
  c: Context<AppEnv>,
): Promise<{ accessToken: string }> {
  // 1. Build JWT payload (D-09)
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    workspaceId: user.workspaceId ?? null,
    workspaceRole,
    isSuperAdmin: user.isSuperAdmin ?? false,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.getTime() : null,
  };
  const accessToken = await signAccessToken(payload, secret);

  // 2. Generate refresh token — store SHA-256 HASH (not plaintext) (D-22)
  const rawToken = crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const familyId = crypto.randomUUID();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    familyId,
    expiresAt,
  });

  // 3. Set httpOnly cookie (D-12)
  setCookie(c, "refresh_token", rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    path: "/",
  });

  return { accessToken };
}

// ─── Private helper: send verification email ──────────────────────────────

async function sendVerificationEmail(
  userId: string,
  userEmail: string,
  db: DbInstance,
  env: AppEnv["Bindings"],
): Promise<void> {
  const rawToken = crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // D-06: 24 hours

  await db.insert(emailVerifications).values({ userId, tokenHash, expiresAt });

  const appUrl = env.FRONTEND_URL ?? "http://localhost:5173";
  const url = `${appUrl}/verify-email?token=${rawToken}`;

  await sendEmail(env, {
    to: { email: userEmail },
    subject: "Verify your email address",
    htmlContent: buildVerificationEmail(url),
  });
}

// ─── Register handler (D-01, D-02, D-04, D-11, D-12, D-22) ───────────────

export const register: AppRouteHandler<RegisterRoute> = async (c) => {
  const { email, password, firstName, lastName } = c.req.valid("json");
  const db = createDb(c.env);

  // Check duplicate email
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return c.json({ message: "Email already in use" }, HttpStatusCodes.CONFLICT);
  }

  // Server-side password length backup (Zod enforces it, but we guard again)
  if (password.length < 8) {
    return c.json({ message: "Password must be at least 8 characters" }, HttpStatusCodes.BAD_REQUEST);
  }

  // Hash password
  const { hash, hasher } = await hashPassword(password);

  // Create user
  const [user] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email,
      firstName,
      lastName,
      passwordHash: hash,
      passwordHasher: hasher,
      // D-02: Auto-verify in E2E mode — skip email verification gate
      ...(c.env.E2E_MODE === "true" ? { emailVerifiedAt: new Date() } : {}),
    })
    .returning();

  // Issue access token + refresh cookie
  const { accessToken } = await issueTokens(user, null, db, c.env.JWT_SECRET, c);

  // Send verification email — failure must NOT fail registration (.catch prevents rejection from propagating)
  // Skip email sending in E2E mode (no point sending emails in tests)
  if (c.env.E2E_MODE !== "true") {
    await sendVerificationEmail(user.id, user.email, db, c.env).catch((err: unknown) => {
      c.var.logger?.error({ err }, "Failed to send verification email");
    });
  }

  return c.json({ accessToken }, HttpStatusCodes.CREATED);
};

// ─── Login handler (D-03, D-08, D-09) ────────────────────────────────────

export const login: AppRouteHandler<LoginRoute> = async (c) => {
  const { email, password } = c.req.valid("json");
  const db = createDb(c.env);

  // Look up user by email
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Migrated user: account exists but no password set (D-02, D-04)
  if (user && user.passwordHash === null) {
    // Reuse existing password reset infrastructure (D-05)
    const rawToken = crypto.randomUUID();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db.insert(passwordResets).values({ userId: user.id, tokenHash, expiresAt });
    const appUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await sendEmail(c.env, {
      to: { email: user.email },
      subject: "Set your Tracky password",
      htmlContent: buildPasswordResetEmail(resetUrl),
    }).catch((err: unknown) => c.var.logger?.error({ err }, "Failed to send migration reset email"));

    return c.json(
      { message: "Your account has been migrated. Check your email for a link to set your new password." },
      HttpStatusCodes.UNAUTHORIZED,
    );
  }

  // Anti-enumeration (D-03): same path for user-not-found and no-password
  if (!user || !user.passwordHash || !user.passwordHasher) {
    // Run dummy verify to consume similar time (prevents timing-based enumeration)
    await verifyPassword(password, "aabbcc:ddeeff", "pbkdf2-v1").catch(() => {});
    return c.json({ message: "Invalid email or password" }, HttpStatusCodes.UNAUTHORIZED);
  }

  // Verify password
  const valid = await verifyPassword(password, user.passwordHash, user.passwordHasher);
  if (!valid) {
    return c.json({ message: "Invalid email or password" }, HttpStatusCodes.UNAUTHORIZED);
  }

  // Resolve workspaceRole: if user has a workspace, query membership
  let workspaceRole: string | null = null;
  if (user.workspaceId) {
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, user.workspaceId),
          eq(workspaceMembers.userId, user.id),
        ),
      )
      .limit(1);
    workspaceRole = membership?.role ?? null;
  }

  // Issue tokens
  const { accessToken } = await issueTokens(user, workspaceRole, db, c.env.JWT_SECRET, c);

  return c.json({ accessToken }, HttpStatusCodes.OK);
};

// ─── Refresh handler (D-13 — no rotation) ────────────────────────────────
// NOTE: Implemented fully in Task 2

export const refresh: AppRouteHandler<RefreshRoute> = async (c) => {
  const rawToken = getCookie(c, "refresh_token");
  if (!rawToken) {
    return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);
  const tokenHash = await hashToken(rawToken);

  const [token] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!token) {
    return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  if (token.expiresAt < new Date()) {
    return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  if (token.revokedAt !== null) {
    return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, token.userId))
    .limit(1);

  if (!user) {
    return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  // Resolve workspaceRole
  let workspaceRole: string | null = null;
  if (user.workspaceId) {
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, user.workspaceId),
          eq(workspaceMembers.userId, user.id),
        ),
      )
      .limit(1);
    workspaceRole = membership?.role ?? null;
  }

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    workspaceId: user.workspaceId ?? null,
    workspaceRole,
    isSuperAdmin: user.isSuperAdmin ?? false,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.getTime() : null,
  };

  const accessToken = await signAccessToken(payload, c.env.JWT_SECRET);

  return c.json({ accessToken }, HttpStatusCodes.OK);
};

// ─── Logout handler (D-14) ───────────────────────────────────────────────
// NOTE: Implemented fully in Task 2

export const logout: AppRouteHandler<LogoutRoute> = async (c) => {
  const rawToken = getCookie(c, "refresh_token");

  if (rawToken) {
    const db = createDb(c.env);
    const tokenHash = await hashToken(rawToken);
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  }

  deleteCookie(c, "refresh_token", { path: "/" });

  return c.json({ message: "Logged out" }, HttpStatusCodes.OK);
};

// ─── Forgot Password handler (D-11 anti-enumeration, D-07 1h expiry) ────────

export const forgotPassword: AppRouteHandler<ForgotPasswordRoute> = async (c) => {
  const { email } = c.req.valid("json");
  const db = createDb(c.env);

  const ANTI_ENUM_MSG = "If an account exists for that email, you'll receive a password reset link shortly.";

  // Look up user by email
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Anti-enumeration (D-11): always return 200 regardless of whether user exists
  if (!user) {
    return c.json({ message: ANTI_ENUM_MSG }, HttpStatusCodes.OK);
  }

  // Generate reset token and insert into passwordResets
  const rawToken = crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // D-07: 1 hour

  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Build reset URL and send email (fire-and-forget — don't fail the request on email error)
  const appUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  await sendEmail(c.env, {
    to: { email: user.email },
    subject: "Reset your Tracky password",
    htmlContent: buildPasswordResetEmail(resetUrl),
  }).catch((err: unknown) => c.var.logger?.error({ err }, "Failed to send reset email"));

  return c.json({ message: ANTI_ENUM_MSG }, HttpStatusCodes.OK);
};

// ─── Reset Password handler (D-10 session invalidation, EMAIL-06) ────────────

export const resetPassword: AppRouteHandler<ResetPasswordRoute> = async (c) => {
  const { token, password } = c.req.valid("json");
  const db = createDb(c.env);

  const tokenHash = await hashToken(token);

  // Look up the password reset row
  const [resetRow] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash))
    .limit(1);

  const INVALID_MSG = "This reset link is invalid or has expired.";

  // Validate: row must exist, not used, not expired
  if (!resetRow || resetRow.usedAt !== null || resetRow.expiresAt <= new Date()) {
    return c.json({ message: INVALID_MSG }, HttpStatusCodes.BAD_REQUEST);
  }

  // Hash the new password
  const { hash, hasher } = await hashPassword(password);

  // Update user password
  await db
    .update(users)
    .set({ passwordHash: hash, passwordHasher: hasher, updatedAt: new Date() })
    .where(eq(users.id, resetRow.userId));

  // Mark token as used
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(eq(passwordResets.id, resetRow.id));

  // D-10 / EMAIL-06: Delete ALL refresh tokens for this user (session invalidation)
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, resetRow.userId));

  return c.json({ message: "Password has been reset" }, HttpStatusCodes.OK);
};

// ─── Verify Email handler (EMAIL-02) ─────────────────────────────────────

export const verifyEmail: AppRouteHandler<VerifyEmailRoute> = async (c) => {
  const { token } = c.req.valid("query");
  const db = createDb(c.env);

  const tokenHash = await hashToken(token);

  const [verification] = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.tokenHash, tokenHash))
    .limit(1);

  const INVALID_MSG = "This verification link is invalid or has expired.";

  // Validate: row must exist, not used, not expired
  if (!verification || verification.usedAt !== null || verification.expiresAt <= new Date()) {
    return c.json({ message: INVALID_MSG }, HttpStatusCodes.BAD_REQUEST);
  }

  // Mark token as used
  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(eq(emailVerifications.id, verification.id));

  // Mark user as verified
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, verification.userId));

  return c.json({ message: "Email verified" }, HttpStatusCodes.OK);
};

// ─── Google OAuth types ───────────────────────────────────────────────────

type GoogleIdTokenPayload = {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
  name?: string;
};

type GoogleTokenResponse = {
  id_token: string;
  access_token: string;
  token_type: string;
  expires_in: number;
};

// Google JWKS endpoint for id_token verification
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Helper: get the base URL used for OAuth redirect_uri
function getBaseUrl(c: Context<AppEnv>): string {
  return c.env.FRONTEND_URL ?? "http://localhost:8787";
}

// ─── Google Login handler (D-01) ─────────────────────────────────────────

export const googleLogin: AppRouteHandler<GoogleLoginRoute> = async (c) => {
  const { codeVerifier, codeChallenge } = await generatePkce();
  const state = crypto.randomUUID();

  const encrypted = await encryptStateCookie({ state, codeVerifier }, c.env.JWT_SECRET);

  setCookie(c, "google_oauth_state", encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  const baseUrl = getBaseUrl(c);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("access_type", "online");

  return c.redirect(authUrl.toString(), 302);
};

// ─── Google Callback handler (D-02, D-05, D-06, D-07, D-08) ─────────────

export const googleCallback: AppRouteHandler<GoogleCallbackRoute> = async (c) => {
  const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";
  const errorUrl = (type: string) => `${frontendUrl}/login?error=${type}`;

  // D-11: Handle OAuth errors from Google
  const oauthError = c.req.query("error");
  if (oauthError === "access_denied") {
    return c.redirect(errorUrl("google_denied"), 302);
  }

  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code || !stateParam) {
    return c.redirect(errorUrl("google_failed"), 302);
  }

  // Validate state cookie
  const encryptedCookie = getCookie(c, "google_oauth_state");
  if (!encryptedCookie) {
    return c.redirect(errorUrl("google_failed"), 302);
  }

  const decryptedCookie = await decryptStateCookie(encryptedCookie, c.env.JWT_SECRET);
  if (!decryptedCookie) {
    return c.redirect(errorUrl("google_failed"), 302);
  }

  if (stateParam !== decryptedCookie.state) {
    return c.redirect(errorUrl("google_failed"), 302);
  }

  // Delete the state cookie (consumed)
  deleteCookie(c, "google_oauth_state", { path: "/" });

  // Wrap the rest in try/catch — any unexpected error redirects to error page
  try {
    const baseUrl = getBaseUrl(c);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange auth code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: decryptedCookie.codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      return c.redirect(errorUrl("google_failed"), 302);
    }

    const tokens = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokens.id_token) {
      return c.redirect(errorUrl("google_failed"), 302);
    }

    // Verify id_token with Google JWKS
    const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: c.env.GOOGLE_CLIENT_ID,
    });

    const profile = payload as unknown as GoogleIdTokenPayload;

    // Reject unverified Google email claims to prevent unauthorized account linking
    if (!profile.email_verified) {
      return c.redirect(`${frontendUrl}/login?error=google_failed`, 302);
    }

    const db = createDb(c.env);

    // D-07: Check for existing Google user by googleId
    const [existingGoogleUser] = await db
      .select()
      .from(users)
      .where(eq(users.googleId, profile.sub))
      .limit(1);

    if (existingGoogleUser) {
      // D-07: Existing Google user — check for pending invitation (D-04)
      const inviteResult = await autoAcceptPendingInvitation(db, profile.email, existingGoogleUser.id);

      let workspaceRole: string | null = null;
      if (inviteResult) {
        workspaceRole = inviteResult.role;
      }
      else if (existingGoogleUser.workspaceId) {
        const [membership] = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, existingGoogleUser.workspaceId),
              eq(workspaceMembers.userId, existingGoogleUser.id),
            ),
          )
          .limit(1);
        workspaceRole = membership?.role ?? null;
      }

      // Re-select user if invite was accepted (workspaceId may have changed)
      const userForTokens = inviteResult
        ? (await db.select().from(users).where(eq(users.id, existingGoogleUser.id)).limit(1))[0] ?? existingGoogleUser
        : existingGoogleUser;

      const { accessToken } = await issueTokens(userForTokens, workspaceRole, db, c.env.JWT_SECRET, c);
      return c.redirect(`${frontendUrl}/oauth/callback?token=${accessToken}`, 302);
    }

    // D-05 / D-06: Check for existing user by email
    const [existingEmailUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    if (existingEmailUser) {
      if (existingEmailUser.emailVerifiedAt !== null) {
        // D-05: Verified email user — link googleId
        await db
          .update(users)
          .set({ googleId: profile.sub, updatedAt: new Date() })
          .where(eq(users.id, existingEmailUser.id));
      }
      else {
        // D-06: Unverified email user — link googleId and set emailVerifiedAt
        await db
          .update(users)
          .set({ googleId: profile.sub, emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, existingEmailUser.id));
      }

      // Re-select the updated user
      const [updatedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, existingEmailUser.id))
        .limit(1);

      // Check for pending invitation (D-04)
      const inviteResult = await autoAcceptPendingInvitation(db, profile.email, updatedUser.id);

      let workspaceRole: string | null = null;
      if (inviteResult) {
        workspaceRole = inviteResult.role;
      }
      else if (updatedUser.workspaceId) {
        const [membership] = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, updatedUser.workspaceId),
              eq(workspaceMembers.userId, updatedUser.id),
            ),
          )
          .limit(1);
        workspaceRole = membership?.role ?? null;
      }

      // Re-select user if invite was accepted (workspaceId may have changed)
      const userForTokens = inviteResult
        ? (await db.select().from(users).where(eq(users.id, updatedUser.id)).limit(1))[0] ?? updatedUser
        : updatedUser;

      const { accessToken } = await issueTokens(userForTokens, workspaceRole, db, c.env.JWT_SECRET, c);
      return c.redirect(`${frontendUrl}/oauth/callback?token=${accessToken}`, 302);
    }

    // D-08: No matching user — create new user with googleId
    const [newUser] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: profile.email,
        firstName: profile.given_name ?? null,
        lastName: profile.family_name ?? null,
        imageUrl: profile.picture ?? null,
        googleId: profile.sub,
        emailVerifiedAt: new Date(),
        role: "member",
      })
      .returning();

    // Check for pending invitation (D-04)
    const inviteResult = await autoAcceptPendingInvitation(db, profile.email, newUser.id);
    const workspaceRole = inviteResult?.role ?? null;

    // Re-select user if invite was accepted (workspaceId may have changed)
    const userForTokens = inviteResult
      ? (await db.select().from(users).where(eq(users.id, newUser.id)).limit(1))[0] ?? newUser
      : newUser;

    const { accessToken } = await issueTokens(userForTokens, workspaceRole, db, c.env.JWT_SECRET, c);
    return c.redirect(`${frontendUrl}/oauth/callback?token=${accessToken}`, 302);
  }
  catch {
    return c.redirect(errorUrl("google_failed"), 302);
  }
};

// ─── Resend Verification handler (EMAIL-01, D-11 anti-enumeration) ────────

export const resendVerification: AppRouteHandler<ResendVerificationRoute> = async (c) => {
  const { email } = c.req.valid("json");
  const db = createDb(c.env);

  const ANTI_ENUM_MSG = "If your email is registered, you'll receive a verification link shortly.";

  // Look up user by email
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Anti-enumeration: return same response for no user or already-verified user
  if (!user || user.emailVerifiedAt !== null) {
    return c.json({ message: ANTI_ENUM_MSG }, HttpStatusCodes.OK);
  }

  // Invalidate all existing unused tokens for this user
  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerifications.userId, user.id),
        isNull(emailVerifications.usedAt),
      ),
    );

  // Send new verification email
  await sendVerificationEmail(user.id, user.email, db, c.env);

  return c.json({ message: ANTI_ENUM_MSG }, HttpStatusCodes.OK);
};

// ─── Helper: auto-accept pending invitation for Google OAuth ─────────────

async function autoAcceptPendingInvitation(
  db: DbInstance,
  userEmail: string,
  userId: string,
): Promise<{ workspaceId: string; role: string } | null> {
  // Find the most recent pending invitation for this email
  const [invitation] = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.email, userEmail),
        isNull(workspaceInvitations.usedAt),
        isNull(workspaceInvitations.revokedAt),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(workspaceInvitations.createdAt))
    .limit(1);

  if (!invitation)
    return null;

  // Check not already a member
  const [existingMember] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, invitation.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existingMember) {
    // Already a member — just mark invitation used, return existing membership info
    await db
      .update(workspaceInvitations)
      .set({ usedAt: new Date() })
      .where(eq(workspaceInvitations.id, invitation.id));
    return { workspaceId: invitation.workspaceId, role: existingMember.role };
  }

  // Add to workspace
  await db.insert(workspaceMembers).values({
    workspaceId: invitation.workspaceId,
    userId,
    role: invitation.role,
  });

  // Mark invitation used
  await db
    .update(workspaceInvitations)
    .set({ usedAt: new Date() })
    .where(eq(workspaceInvitations.id, invitation.id));

  // Update user's workspaceId if not set
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user && !user.workspaceId) {
    await db
      .update(users)
      .set({ workspaceId: invitation.workspaceId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  return { workspaceId: invitation.workspaceId, role: invitation.role };
}

// ─── Get Invite handler (public) ─────────────────────────────────────────

export const getInvite: AppRouteHandler<GetInviteRoute> = async (c) => {
  const { token } = c.req.valid("query");
  const db = createDb(c.env);

  const tokenHash = await hashToken(token);

  const [invitation] = await db
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      usedAt: workspaceInvitations.usedAt,
      revokedAt: workspaceInvitations.revokedAt,
      expiresAt: workspaceInvitations.expiresAt,
      inviterUserId: workspaceInvitations.inviterUserId,
      workspaceId: workspaceInvitations.workspaceId,
    })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, tokenHash))
    .limit(1);

  if (
    !invitation
    || invitation.usedAt !== null
    || invitation.revokedAt !== null
    || invitation.expiresAt <= new Date()
  ) {
    return c.json({ message: "Invitation not found or expired" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get workspace name
  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, invitation.workspaceId))
    .limit(1);

  // Get inviter name
  const [inviter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, invitation.inviterUserId))
    .limit(1);

  const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ").trim() || null;

  return c.json({
    email: invitation.email,
    workspaceName: workspace?.name ?? "",
    inviterName,
    role: invitation.role,
  }, HttpStatusCodes.OK);
};

// ─── Accept Invite handler (optionalJwtAuth — both auth and unauth flows) ─

export const acceptInvite: AppRouteHandler<AcceptInviteRoute> = async (c) => {
  const { token, firstName, lastName, password } = c.req.valid("json");
  const db = createDb(c.env);

  const tokenHash = await hashToken(token);

  const [invitation] = await db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, tokenHash))
    .limit(1);

  if (
    !invitation
    || invitation.usedAt !== null
    || invitation.revokedAt !== null
    || invitation.expiresAt <= new Date()
  ) {
    return c.json({ message: "Invitation not found or expired" }, HttpStatusCodes.NOT_FOUND);
  }

  // Get workspace for slug in response
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, invitation.workspaceId))
    .limit(1);

  const userId = c.get("userId");

  if (userId) {
    // Case A: Authenticated user — verify email matches invitation
    const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser || currentUser.email !== invitation.email) {
      return c.json(
        { message: "This invitation was sent to a different email address. Please sign in with the correct account." },
        HttpStatusCodes.FORBIDDEN,
      );
    }

    const [existingMember] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, invitation.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (existingMember) {
      return c.json({ message: "You're already a member of this workspace." }, HttpStatusCodes.CONFLICT);
    }

    // Add to workspace
    await db.insert(workspaceMembers).values({
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
    });

    // Mark invitation used
    await db
      .update(workspaceInvitations)
      .set({ usedAt: new Date() })
      .where(eq(workspaceInvitations.id, invitation.id));

    // Update user's workspaceId if not set
    const [userRecord] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRecord && !userRecord.workspaceId) {
      await db
        .update(users)
        .set({ workspaceId: invitation.workspaceId, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    // Email notification (ADMIN-01) — notify all workspace admins
    {
      const admins = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, invitation.workspaceId),
            inArray(workspaceMembers.role, ["owner", "admin"]),
          ),
        );

      if (admins.length > 0) {
        const [newMember] = await db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const actorName = [newMember?.firstName, newMember?.lastName].filter(Boolean).join(" ") || "A new member";

        const workspaceSlug = workspace?.slug ?? invitation.workspaceId;
        const workspaceName = workspace?.name ?? "your workspace";
        const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

        for (const admin of admins) {
          await dispatchNotificationEmail({
            db,
            env: c.env,
            type: "member_joined",
            actorId: userId,
            recipientId: admin.userId,
            payload: {
              actorName,
              workspaceName,
              workspaceSlug,
              ctaUrl: `${frontendUrl}/settings`,
              preferencesUrl: `${frontendUrl}/settings#notifications`,
            },
          }).catch(() => {});
        }
      }
    }

    return c.json({
      workspaceId: invitation.workspaceId,
      workspaceSlug: workspace?.slug ?? "",
    }, HttpStatusCodes.OK);
  }

  // Case B: Unauthenticated — create new user
  if (!firstName || !lastName || !password) {
    return c.json(
      { message: "First name, last name, and password are required for new accounts." },
      HttpStatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  // Check if email already has an account
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, invitation.email))
    .limit(1);

  if (existingUser) {
    return c.json(
      { message: "An account with this email already exists. Please log in first." },
      HttpStatusCodes.CONFLICT,
    );
  }

  // Hash password
  const { hash, hasher } = await hashPassword(password);

  // Create user with emailVerifiedAt set (D-03)
  const [newUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: invitation.email,
      firstName,
      lastName,
      passwordHash: hash,
      passwordHasher: hasher,
      emailVerifiedAt: new Date(),
      workspaceId: invitation.workspaceId,
    })
    .returning();

  // Add to workspace
  await db.insert(workspaceMembers).values({
    workspaceId: invitation.workspaceId,
    userId: newUser.id,
    role: invitation.role,
  });

  // Mark invitation used
  await db
    .update(workspaceInvitations)
    .set({ usedAt: new Date() })
    .where(eq(workspaceInvitations.id, invitation.id));

  // Email notification (ADMIN-01) — notify all workspace admins about new member
  {
    const admins = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, invitation.workspaceId),
          inArray(workspaceMembers.role, ["owner", "admin"]),
        ),
      );

    if (admins.length > 0) {
      const actorName = [firstName, lastName].filter(Boolean).join(" ") || "A new member";
      const workspaceSlug = workspace?.slug ?? invitation.workspaceId;
      const workspaceName = workspace?.name ?? "your workspace";
      const frontendUrl = c.env.FRONTEND_URL ?? "http://localhost:5173";

      for (const admin of admins) {
        await dispatchNotificationEmail({
          db,
          env: c.env,
          type: "member_joined",
          actorId: newUser.id,
          recipientId: admin.userId,
          payload: {
            actorName,
            workspaceName,
            workspaceSlug,
            ctaUrl: `${frontendUrl}/settings`,
            preferencesUrl: `${frontendUrl}/settings#notifications`,
          },
        }).catch(() => {});
      }
    }
  }

  // Issue tokens
  const { accessToken } = await issueTokens(newUser, invitation.role, db, c.env.JWT_SECRET, c);

  return c.json({
    accessToken,
    workspaceId: invitation.workspaceId,
    workspaceSlug: workspace?.slug ?? "",
  }, HttpStatusCodes.OK);
};

// ─── Update Profile handler (USER-01a) ───────────────────────────────────

export const updateProfile: AppRouteHandler<UpdateProfileRoute> = async (c) => {
  const userId = c.get("userId");
  const { firstName, lastName } = c.req.valid("json");
  const db = createDb(c.env);

  // Build update fields using proper Drizzle column objects
  const updateFields: Partial<{ firstName: string; lastName: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  };
  if (firstName !== undefined)
    updateFields.firstName = firstName;
  if (lastName !== undefined)
    updateFields.lastName = lastName;

  const [updatedUser] = await db
    .update(users)
    .set(updateFields)
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
  }

  return c.json(updatedUser, HttpStatusCodes.OK);
};

// ─── Upload Avatar handler (USER-01b, USER-01c) ───────────────────────────

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB per D-05

export const uploadAvatar: AppRouteHandler<UploadAvatarRoute> = async (c) => {
  const userId = c.get("userId");

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ message: "No file provided" }, HttpStatusCodes.BAD_REQUEST);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return c.json({ message: "File size exceeds 2 MB limit" }, HttpStatusCodes.BAD_REQUEST);
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return c.json({ message: "File must be image/jpeg, image/png, or image/webp" }, HttpStatusCodes.BAD_REQUEST);
  }

  // Store in R2 with extension-less key (D-03, pitfall 4 workaround)
  const r2Key = `avatars/${userId}`;

  if (c.env.IMAGES) {
    // Resize via Images binding to 256x256 (D-04)
    const resized = await c.env.IMAGES
      .input(file.stream())
      .transform({ width: 256, height: 256 })
      .output({ format: file.type });

    await c.env.R2_BUCKET.put(r2Key, resized.body, {
      httpMetadata: { contentType: file.type },
    });
  }
  else {
    // Fallback: store raw file without resize (local dev / test environments without Images binding)
    await c.env.R2_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
  }

  // Update user record with the served URL
  const avatarUrl = `/api/auth/avatar/${userId}`;
  const db = createDb(c.env);
  await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ avatarUrl }, HttpStatusCodes.OK);
};

// ─── Get Avatar handler (public — streams from R2) ────────────────────────

export const getAvatar: AppRouteHandler<GetAvatarRoute> = async (c) => {
  const { userId } = c.req.valid("param");
  const r2Key = `avatars/${userId}`;

  const obj = await c.env.R2_BUCKET.get(r2Key);
  if (!obj) {
    return c.json({ message: "Avatar not found" }, HttpStatusCodes.NOT_FOUND);
  }

  c.header("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(obj.body, HttpStatusCodes.OK);
};

// ─── My Workspaces handler ───────────────────────────────────────────────

export const myWorkspaces: AppRouteHandler<MyWorkspacesRoute> = async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const db = createDb(c.env);

  const memberships = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return c.json({ workspaces: memberships }, HttpStatusCodes.OK);
};

// ─── Switch Workspace handler ────────────────────────────────────────────

export const switchWorkspace: AppRouteHandler<SwitchWorkspaceRoute> = async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const { workspaceId } = c.req.valid("json");
  const db = createDb(c.env);

  // Verify membership
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return c.json({ message: "You are not a member of this workspace" }, HttpStatusCodes.FORBIDDEN);
  }

  // Update user's active workspace
  await db
    .update(users)
    .set({ workspaceId, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Re-fetch user for token issuance
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  const { accessToken } = await issueTokens(user, membership.role, db, c.env.JWT_SECRET, c);

  return c.json({ accessToken }, HttpStatusCodes.OK);
};
