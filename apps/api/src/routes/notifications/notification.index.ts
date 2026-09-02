import createRouter from "@/api/lib/create-router";

import * as handlers from "./notification.handlers";
import * as routes from "./notification.routes";

const notificationRoutes = createRouter()
  .openapi(routes.listNotifications, handlers.listNotifications)
  .openapi(routes.markNotificationRead, handlers.markNotificationRead)
  .openapi(routes.markAllNotificationsRead, handlers.markAllNotificationsRead)
  .openapi(routes.getUnreadCount, handlers.getUnreadCount);

export default notificationRoutes;
export type NotificationRoutesType = typeof notificationRoutes;
