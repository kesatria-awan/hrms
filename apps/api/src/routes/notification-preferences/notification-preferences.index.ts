import createRouter from "@/api/lib/create-router";

import * as handlers from "./notification-preferences.handlers";
import * as routes from "./notification-preferences.routes";

const notificationPreferencesRouter = createRouter()
  .openapi(routes.getPreferences, handlers.getPreferences)
  .openapi(routes.updatePreferences, handlers.updatePreferences);

export default notificationPreferencesRouter;
export type NotificationPreferencesRoutesType = typeof notificationPreferencesRouter;
