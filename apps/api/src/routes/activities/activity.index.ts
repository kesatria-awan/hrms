import createRouter from "@/api/lib/create-router";

import * as handlers from "./activity.handlers";
import * as routes from "./activity.routes";

const activityRoutes = createRouter()
  .openapi(routes.listActivities, handlers.listActivities)
  .openapi(routes.listTaskActivities, handlers.listTaskActivities);

export default activityRoutes;
export type ActivityRoutesType = typeof activityRoutes;
