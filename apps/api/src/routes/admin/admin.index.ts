import createRouter from "@/api/lib/create-router";

import * as handlers from "./admin.handlers";
import * as routes from "./admin.routes";

// Chain all routes and export the type - this preserves RPC typing for nested POST/PUT
const adminRoutes = createRouter()
  .openapi(routes.listAdminWorkspaces, handlers.listAdminWorkspaces)
  .openapi(routes.getAdminWorkspace, handlers.getAdminWorkspace)
  .openapi(routes.updateAdminWorkspace, handlers.updateAdminWorkspace)
  .openapi(routes.deleteAdminWorkspace, handlers.deleteAdminWorkspace)
  .openapi(routes.listAdminUsers, handlers.listAdminUsers)
  .openapi(routes.listAuditLogs, handlers.listAuditLogs);

export default adminRoutes;
export type AdminRoutesType = typeof adminRoutes;
