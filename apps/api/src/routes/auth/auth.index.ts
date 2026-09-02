import createRouter from "@/api/lib/create-router";

import * as handlers from "./auth.handlers";
import * as routes from "./auth.routes";

const router = createRouter()
  .openapi(routes.signup, handlers.signup)
  .openapi(routes.me, handlers.me)
  .openapi(routes.register, handlers.register)
  .openapi(routes.login, handlers.login)
  .openapi(routes.refresh, handlers.refresh)
  .openapi(routes.logout, handlers.logout)
  .openapi(routes.forgotPassword, handlers.forgotPassword)
  .openapi(routes.resetPassword, handlers.resetPassword)
  .openapi(routes.verifyEmail, handlers.verifyEmail)
  .openapi(routes.resendVerification, handlers.resendVerification)
  .openapi(routes.googleLogin, handlers.googleLogin)
  .openapi(routes.googleCallback, handlers.googleCallback)
  .openapi(routes.getInvite, handlers.getInvite)
  .openapi(routes.acceptInvite, handlers.acceptInvite)
  .openapi(routes.updateProfile, handlers.updateProfile)
  .openapi(routes.uploadAvatar, handlers.uploadAvatar)
  .openapi(routes.getAvatar, handlers.getAvatar)
  .openapi(routes.myWorkspaces, handlers.myWorkspaces)
  .openapi(routes.switchWorkspace, handlers.switchWorkspace);

export default router;
