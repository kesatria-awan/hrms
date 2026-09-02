import createRouter from "@/api/lib/create-router";

import * as handlers from "./workspace.handlers";
import * as routes from "./workspace.routes";

const router = createRouter()
  .openapi(routes.updateWorkspaceSettings, handlers.updateWorkspaceSettings)
  .openapi(routes.listWorkspaceAuditLogs, handlers.listWorkspaceAuditLogs)
  .openapi(routes.listWorkspaceMembers, handlers.listWorkspaceMembers)
  .openapi(routes.listWorkspaceInvitations, handlers.listWorkspaceInvitations)
  .openapi(routes.createWorkspaceInvitation, handlers.createWorkspaceInvitation)
  .openapi(routes.revokeWorkspaceInvitation, handlers.revokeWorkspaceInvitation)
  .openapi(routes.resendWorkspaceInvitation, handlers.resendWorkspaceInvitation)
  .openapi(routes.updateWorkspaceMemberRole, handlers.updateWorkspaceMemberRole)
  .openapi(routes.removeWorkspaceMember, handlers.removeWorkspaceMember)
  .openapi(routes.updateMemberBillingPermission, handlers.updateMemberBillingPermission);

export default router;
export type WorkspaceRoutesType = typeof router;
