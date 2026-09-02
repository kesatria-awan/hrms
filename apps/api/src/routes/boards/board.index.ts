import createRouter from "@/api/lib/create-router";

import * as handlers from "./board.handlers";
import * as routes from "./board.routes";

// Chain all routes and export the type - this preserves RPC typing for nested POST/PUT
const boardRoutes = createRouter()
  .openapi(routes.listBoards, handlers.listBoards)
  .openapi(routes.getBoard, handlers.getBoard)
  .openapi(routes.createBoard, handlers.createBoard)
  .openapi(routes.updateBoard, handlers.updateBoard)
  .openapi(routes.deleteBoard, handlers.deleteBoard)
  .openapi(routes.addBoardMember, handlers.addBoardMember)
  .openapi(routes.removeBoardMember, handlers.removeBoardMember)
  .openapi(routes.listBoardMembers, handlers.listBoardMembers)
  .openapi(routes.updateBoardMemberRole, handlers.updateBoardMemberRole);

export default boardRoutes;
export type BoardRoutesType = typeof boardRoutes;
