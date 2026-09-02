import createRouter from "@/api/lib/create-router";

import * as handlers from "./column.handlers";
import * as routes from "./column.routes";

const router = createRouter()
  .openapi(routes.createColumn, handlers.createColumn)
  .openapi(routes.updateColumn, handlers.updateColumn)
  .openapi(routes.deleteColumn, handlers.deleteColumn)
  .openapi(routes.reorderColumns, handlers.reorderColumns);

export default router;
