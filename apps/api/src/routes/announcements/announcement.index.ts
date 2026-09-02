import createRouter from "@/api/lib/create-router";

import * as handlers from "./announcement.handlers";
import * as routes from "./announcement.routes";

const announcementRoutes = createRouter()
  .openapi(routes.listAnnouncements, handlers.listAnnouncements)
  .openapi(routes.createAnnouncement, handlers.createAnnouncement);

export default announcementRoutes;
export type AnnouncementRoutesType = typeof announcementRoutes;
