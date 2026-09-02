import createRouter from "@/api/lib/create-router";

import * as handlers from "./comment.handlers";
import * as routes from "./comment.routes";

const commentRoutes = createRouter()
  .openapi(routes.createComment, handlers.createComment)
  .openapi(routes.listComments, handlers.listComments)
  .openapi(routes.updateComment, handlers.updateComment)
  .openapi(routes.deleteComment, handlers.deleteComment);

export default commentRoutes;
export type CommentRoutesType = typeof commentRoutes;
