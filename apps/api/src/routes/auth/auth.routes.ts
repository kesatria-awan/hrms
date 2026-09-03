import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createMessageObjectSchema } from "stoker/openapi/schemas";

import { selectUserSchema } from "@/api/db/schema/user";
import { jwtAuth } from "@/api/middlewares/jwt-auth";

const tags = ["Auth"];

const requestOtpResponseSchema = z.object({
  message: z.string(),
  devCode: z.string().optional(),
});

const verifyOtpResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: selectUserSchema.pick({ id: true, email: true, firstName: true, lastName: true, role: true }),
  isNewUser: z.boolean(),
});

export const requestOtp = createRoute({
  method: "post",
  path: "/otp/request",
  tags,
  summary: "Request a login OTP code",
  description: "Sends a 6-digit login code to the given @kesatria.my email via mailcow relay",
  request: {
    body: jsonContentRequired(
      z.object({ email: z.string().email() }),
      "Email address to send the OTP to",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(requestOtpResponseSchema, "OTP sent"),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(createMessageObjectSchema("Too many requests — wait before retrying"), "Rate limited"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(createMessageObjectSchema("Only @kesatria.my emails can log in"), "Domain not allowed"),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(createMessageObjectSchema("Failed to send OTP"), "Email send failed"),
  },
});

export const verifyOtp = createRoute({
  method: "post",
  path: "/otp/verify",
  tags,
  summary: "Verify OTP and log in",
  description: "Exchanges a 6-digit code for JWT tokens; auto-creates the user on first login",
  request: {
    body: jsonContentRequired(
      z.object({ email: z.string().email(), code: z.string().length(6) }),
      "Email + 6-digit code",
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContentRequired(verifyOtpResponseSchema, "Logged in"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(createMessageObjectSchema("Invalid or expired code"), "Invalid code"),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(createMessageObjectSchema("Too many attempts"), "Too many attempts"),
  },
});

export const refresh = createRoute({
  method: "post",
  path: "/refresh",
  tags,
  summary: "Refresh access token",
  request: {
    body: jsonContentRequired(z.object({ refreshToken: z.string() }), "Refresh token"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContentRequired(z.object({ accessToken: z.string() }), "New access token"),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(createMessageObjectSchema("Invalid refresh token"), "Invalid token"),
  },
});

export const logout = createRoute({
  method: "post",
  path: "/logout",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Log out (revoke refresh token)",
  request: {
    body: jsonContentRequired(z.object({ refreshToken: z.string() }), "Refresh token to revoke"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("Logged out"), "Logged out"),
  },
});

export const me = createRoute({
  method: "get",
  path: "/me",
  tags,
  middleware: [jwtAuth()] as const,
  summary: "Get current user",
  responses: {
    [HttpStatusCodes.OK]: jsonContentRequired(
      z.object({ user: selectUserSchema.pick({ id: true, email: true, firstName: true, lastName: true, role: true, employeeId: true }) }),
      "Current user",
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(createMessageObjectSchema("Unauthorized"), "Unauthorized"),
  },
});

export type RequestOtpRoute = typeof requestOtp;
export type VerifyOtpRoute = typeof verifyOtp;
export type RefreshRoute = typeof refresh;
export type LogoutRoute = typeof logout;
export type MeRoute = typeof me;