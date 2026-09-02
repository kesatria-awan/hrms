import createRouter from "@/api/lib/create-router";

import * as handlers from "./attachment.handlers";
import * as routes from "./attachment.routes";

const attachmentRoutes = createRouter()
  // Task-scoped routes first (more specific paths)
  .openapi(routes.requestUpload, handlers.requestUpload)
  .openapi(routes.listAttachments, handlers.listAttachments)
  // Attachment-scoped routes
  .openapi(routes.listWorkspaceAttachments, handlers.listWorkspaceAttachments)
  .openapi(routes.getDownloadUrl, handlers.getDownloadUrl)
  .openapi(routes.deleteAttachment, handlers.deleteAttachment);

export default attachmentRoutes;
export type AttachmentRoutesType = typeof attachmentRoutes;
