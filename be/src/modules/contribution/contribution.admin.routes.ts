import { Router } from "express";
import { authenticateToken, requireFeature, requirePermission, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { createContributionAdminController } from "./controllers/contribution-admin.controller";
import { adminStatsQuerySchema, workspaceIdParamSchema } from "./dtos";
import { getContributionContainer, type ContributionContainer } from "./contribution.container";

export function createContributionAdminRouter(c: ContributionContainer = getContributionContainer()): Router {
  const admin = createContributionAdminController(c.stats);
  const router = Router();


  /**
   * @openapi
   * /admin/workspaces/{id}/contribution-stats:
   *   get:
   *     summary: "(p4-06) Sức khoẻ tính năng báo cáo đóng góp của nhóm cho admin nền tảng — { boardsWithCustomWeights, exports { ready, failed }, lastComputedAt, staleBoards, pendingBoards }"
   *     description: "CHỈ số đếm (`?days=30`) — KHÔNG điểm, %, heatmap hay danh sách thẻ của thành viên. Quyền `workspace:view`."
   *     tags: [Admin/Contribution]
   *     security: [{ BearerAuth: [] }]
   */
  router.get(
    "/admin/workspaces/:id/contribution-stats",
    authenticateToken,
    requireFeature(MODULES.PROJECT),
    requirePermission("workspace:view"),
    validateParams(workspaceIdParamSchema),
    validateQuery(adminStatsQuerySchema),
    admin.get
  );

  return router;
}

export default createContributionAdminRouter();
