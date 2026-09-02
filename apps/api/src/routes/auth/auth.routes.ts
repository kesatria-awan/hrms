import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { selectUserSchema } from "@/api/db/schema/user";
import { selectWorkspaceSchema } from "@/api/db/schema/workspace";
import { jwtAuth, optionalJwtAuth } from "@/api/middlewares/jwt-auth";

const tags = ["Auth"];

// Schema for signup request (create workspace)
const signupRequestSchema = z.object({
  workspaceName: z.string().min(1).max(100),
  workspaceSlug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

// Schema for signup response
const signupResponseSchema = z.object({
  user: selectUserSchema,
  workspace: selectWorkspaceSchema,
});

// Schema for me response
const meResponseSchema = z.object({
  user: selectUserSchema.nullable(),
  workspace: selectWorkspaceSchema.nullable(),
  ownsWorkspace: z.boolean(),
  canManageBilling: z.boolean(),
});

export const signup = createRoute({
  method: "post",
  path: "/signup",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Complete signup by creating a workspace",
  description: "Creates a new workspace and associates the authenticated Clerk user with it as workspace admin",
  request: {
    body: jsonContentRequired(signupRequestSchema, "Workspace details"),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContentRequired(signupResponseSchema, "Workspace and user created"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      z.object({ message: z.string() }),
      "Invalid input or slug already taken",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      z.object({ message: z.string() }),
      "Not authenticated",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      z.object({ message: z.string() }),
      "User already belongs to a workspace",
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      z.object({ message: z.string() }),
      "Failed to create workspace organization",
    ),
  },
});

export const me = createRoute({
  method: "get",
  path: "/me",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Get current user",
  description: "Returns the authenticated user's profile and workspace information",
  responses: {
    [HttpStatusCodes.OK]: jsonContentRequired(meResponseSchema, "Current user info"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      z.object({ message: z.string() }),
      "Missing required data (e.g., email)",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      z.object({ message: z.string() }),
      "Not authenticated",
    ),
  },
});

export type SignupRoute = typeof signup;
export type MeRoute = typeof me;

// ─── Custom email/password auth schemas ────────────────────────────────────

const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authResponseSchema = z.object({
  accessToken: z.string(),
});

const authErrorSchema = z.object({
  message: z.string(),
});

// ─── Route definitions (public — no middleware, per D-05) ──────────────────

export const register = createRoute({
  method: "post",
  path: "/register",
  tags,
  summary: "Register a new user",
  description: "Creates a new user account with email and password. Returns an access token and sets an httpOnly refresh token cookie.",
  request: { body: jsonContentRequired(registerRequestSchema, "Registration details") },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(authResponseSchema, "Registration successful"),
    [HttpStatusCodes.CONFLICT]: jsonContent(authErrorSchema, "Email already in use"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(authErrorSchema, "Validation error"),
  },
});

export const login = createRoute({
  method: "post",
  path: "/login",
  tags,
  summary: "Login with email and password",
  description: "Authenticates the user and returns an access token. Sets an httpOnly refresh token cookie.",
  request: { body: jsonContentRequired(loginRequestSchema, "Login credentials") },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(authResponseSchema, "Login successful"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(authErrorSchema, "Invalid credentials"),
  },
});

export const refresh = createRoute({
  method: "post",
  path: "/refresh",
  tags,
  summary: "Refresh access token",
  description: "Issues a new access token using the refresh token cookie. Does not rotate the refresh token (v1 behavior per D-13).",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(authResponseSchema, "Token refreshed"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(authErrorSchema, "Invalid refresh token"),
  },
});

export const logout = createRoute({
  method: "post",
  path: "/logout",
  tags,
  summary: "Logout",
  description: "Clears the refresh token cookie and deletes the token from the database.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string() }), "Logged out"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(authErrorSchema, "No valid session"),
  },
});

export type RegisterRoute = typeof register;
export type LoginRoute = typeof login;
export type RefreshRoute = typeof refresh;
export type LogoutRoute = typeof logout;

// ─── Password reset routes ────────────────────────────────────────────────

export const forgotPassword = createRoute({
  method: "post",
  path: "/forgot-password",
  tags,
  summary: "Request a password reset email",
  description: "Sends a password reset email if the account exists. Always returns 200 to prevent user enumeration (D-11).",
  request: { body: jsonContentRequired(z.object({ email: z.string().email() }), "Email address") },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string() }), "Reset email sent if account exists"),
  },
});

export const resetPassword = createRoute({
  method: "post",
  path: "/reset-password",
  tags,
  summary: "Reset password via token",
  description: "Sets a new password using a valid reset token. Invalidates all existing sessions (D-10 / EMAIL-06).",
  request: {
    body: jsonContentRequired(
      z.object({ token: z.string().min(1), password: z.string().min(8, "Password must be at least 8 characters") }),
      "Reset token and new password",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string() }), "Password reset"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(z.object({ message: z.string() }), "Invalid or expired token"),
  },
});

export type ForgotPasswordRoute = typeof forgotPassword;
export type ResetPasswordRoute = typeof resetPassword;

// ─── Email verification routes ────────────────────────────────────────────

export const verifyEmail = createRoute({
  method: "get",
  path: "/verify-email",
  tags,
  summary: "Verify email address",
  description: "Validates the verification token and marks the user's email as verified.",
  request: { query: z.object({ token: z.string().min(1) }) },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string() }), "Email verified"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(z.object({ message: z.string() }), "Invalid or expired token"),
  },
});

export const resendVerification = createRoute({
  method: "post",
  path: "/resend-verification",
  tags,
  summary: "Resend verification email",
  description: "Sends a new verification email. Always returns 200 to prevent user enumeration (D-11).",
  request: { body: jsonContentRequired(z.object({ email: z.string().email() }), "Email address") },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string() }), "Verification email sent"),
  },
});

export type VerifyEmailRoute = typeof verifyEmail;
export type ResendVerificationRoute = typeof resendVerification;

// ─── Google OAuth routes ──────────────────────────────────────────────────

export const googleLogin = createRoute({
  method: "get",
  path: "/google/login",
  tags,
  summary: "Initiate Google OAuth login",
  description: "Generates PKCE parameters, stores state in encrypted cookie, redirects to Google consent screen.",
  responses: {
    302: { description: "Redirect to Google OAuth consent screen" },
  },
});

export const googleCallback = createRoute({
  method: "get",
  path: "/google/callback",
  tags,
  summary: "Google OAuth callback",
  description: "Validates OAuth state, exchanges auth code for tokens, creates/links user, issues JWT.",
  request: {
    query: z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  responses: {
    302: { description: "Redirect to SPA with token or error" },
  },
});

export type GoogleLoginRoute = typeof googleLogin;
export type GoogleCallbackRoute = typeof googleCallback;

// ─── Workspace Invitation routes ──────────────────────────────────────────

// Get invitation metadata (public — no auth)
export const getInvite = createRoute({
  method: "get",
  path: "/invite",
  tags,
  summary: "Get invitation details",
  description: "Fetch invitation metadata by token (public endpoint)",
  request: {
    query: z.object({
      token: z.string().min(1, "Token is required"),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        email: z.string().email(),
        workspaceName: z.string(),
        inviterName: z.string().nullable(),
        role: z.string(),
      }),
      "Invitation details",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Invitation not found or expired"),
      "Not found",
    ),
  },
});

// Accept invitation (optionally authenticated)
export const acceptInvite = createRoute({
  method: "post",
  path: "/invite/accept",
  tags,
  summary: "Accept invitation",
  description: "Accept workspace invitation. Authenticated users are added directly. New users provide name and password to create an account.",
  middleware: [optionalJwtAuth()] as const,
  request: {
    body: jsonContentRequired(
      z.object({
        token: z.string().min(1),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        password: z.string().min(8).optional(),
      }),
      "Accept invitation details",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        accessToken: z.string().optional(),
        workspaceId: z.string(),
        workspaceSlug: z.string(),
      }),
      "Invitation accepted",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Invitation not found or expired"),
      "Not found",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema("Email mismatch"),
      "Authenticated user email does not match invitation email",
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema("Already a member"),
      "Already a member",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createMessageObjectSchema("Validation error"),
      "Validation error",
    ),
  },
});

export type GetInviteRoute = typeof getInvite;
export type AcceptInviteRoute = typeof acceptInvite;

// ─── User Profile routes ──────────────────────────────────────────────────

const updateProfileBodySchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
  })
  .refine(data => data.firstName !== undefined || data.lastName !== undefined, {
    message: "At least one of firstName or lastName must be provided",
  });

export const updateProfile = createRoute({
  method: "patch",
  path: "/profile",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Update user profile",
  description: "Updates the authenticated user's firstName and/or lastName.",
  request: {
    body: jsonContentRequired(updateProfileBodySchema, "Profile update fields"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(selectUserSchema, "Updated user"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      z.object({ message: z.string() }),
      "Not authenticated",
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      z.object({ message: z.string() }),
      "User not found",
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      z.object({ message: z.string() }),
      "Validation error",
    ),
  },
});

export const uploadAvatar = createRoute({
  method: "post",
  path: "/avatar",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Upload avatar",
  description: "Accepts a multipart file upload, resizes to 256x256 via Images binding, stores in R2, and updates avatarUrl.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ avatarUrl: z.string() }),
      "Avatar uploaded",
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      z.object({ message: z.string() }),
      "Invalid file (no file, wrong type, or too large)",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      z.object({ message: z.string() }),
      "Not authenticated",
    ),
  },
});

export const getAvatar = createRoute({
  method: "get",
  path: "/avatar/:userId",
  tags,
  summary: "Get user avatar",
  description: "Streams the user's avatar from R2 storage. Public endpoint.",
  request: {
    params: z.object({ userId: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: "Avatar image",
      content: {
        "image/jpeg": {
          schema: z.instanceof(Uint8Array),
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      z.object({ message: z.string() }),
      "Avatar not found",
    ),
  },
});

// ─── Workspace switching ─────────────────────────────────────────────────

export const myWorkspaces = createRoute({
  method: "get",
  path: "/my-workspaces",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "List workspaces the user belongs to",
  responses: {
    [HttpStatusCodes.OK]: jsonContentRequired(
      z.object({
        workspaces: z.array(z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          role: z.string(),
        })),
      }),
      "User's workspaces",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      z.object({ message: z.string() }),
      "Not authenticated",
    ),
  },
});

export const switchWorkspace = createRoute({
  method: "post",
  path: "/switch-workspace",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Switch active workspace",
  request: {
    body: jsonContentRequired(
      z.object({ workspaceId: z.string() }),
      "Workspace to switch to",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContentRequired(
      z.object({ accessToken: z.string() }),
      "New access token for the switched workspace",
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      z.object({ message: z.string() }),
      "Not a member of the workspace",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      z.object({ message: z.string() }),
      "Not authenticated",
    ),
  },
});

export type UpdateProfileRoute = typeof updateProfile;
export type UploadAvatarRoute = typeof uploadAvatar;
export type GetAvatarRoute = typeof getAvatar;
export type MyWorkspacesRoute = typeof myWorkspaces;
export type SwitchWorkspaceRoute = typeof switchWorkspace;
