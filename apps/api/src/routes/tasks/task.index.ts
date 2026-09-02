import createRouter from "@/api/lib/create-router";

import * as handlers from "./task.handlers";
import * as routes from "./task.routes";

// Route order matters: /tasks/reorder and /tasks/overdue must come before /tasks/{id}
const taskRoutes = createRouter()
  .openapi(routes.createTask, handlers.createTask)
  .openapi(routes.listTasks, handlers.listTasks)
  .openapi(routes.listOverdueTasks, handlers.listOverdueTasks) // Before :id routes
  .openapi(routes.reorderTasks, handlers.reorderTasks) // Before :id routes
  .openapi(routes.getTask, handlers.getTask)
  .openapi(routes.updateTask, handlers.updateTask)
  .openapi(routes.deleteTask, handlers.deleteTask)
  .openapi(routes.moveTask, handlers.moveTask)
  .openapi(routes.archiveTask, handlers.archiveTask)
  .openapi(routes.unarchiveTask, handlers.unarchiveTask)
  .openapi(routes.assignUser, handlers.assignUser)
  .openapi(routes.unassignUser, handlers.unassignUser);

export default taskRoutes;
export type TaskRoutesType = typeof taskRoutes;
