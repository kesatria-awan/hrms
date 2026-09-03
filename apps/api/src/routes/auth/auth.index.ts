import createRouter from "@/api/lib/create-router";
import * as handlers from "./auth.handlers";
import * as routes from "./auth.routes";

const authRouter = createRouter()
  .openapi(routes.requestOtp, handlers.requestOtp)
  .openapi(routes.verifyOtp, handlers.verifyOtp)
  .openapi(routes.refresh, handlers.refresh)
  .openapi(routes.logout, handlers.logout)
  .openapi(routes.me, handlers.me);

export default authRouter;