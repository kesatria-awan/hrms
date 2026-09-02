import createRouter from "@/api/lib/create-router";

import * as handlers from "./user.handlers";
import * as routes from "./user.routes";

const router = createRouter()
  .openapi(routes.listUsers, handlers.listUsers);

export default router;
