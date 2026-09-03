import createRouter from "@/api/lib/create-router";

import * as handlers from "./attachment.handlers";
import * as routes from "./attachment.routes";

const attachmentsRouter = createRouter()
  .openapi(routes.requestUpload, handlers.requestUpload)
  .openapi(routes.getDownloadUrl, handlers.getDownloadUrl)
  .openapi(routes.listAttachments, handlers.listAttachments)
  .openapi(routes.deleteAttachment, handlers.deleteAttachment);

export default attachmentsRouter;