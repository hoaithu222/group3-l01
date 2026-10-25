import { Router } from "express";
import { authenticateToken, apiLimiter, requireFeature, validateParams, validateQuery } from "../../core/middlewares";
import { requireScope, requireWorkspaceRole } from "../../core/permission";
import { MODULES } from "../../core/constants/modules";
import { createScopeReportController } from "./controllers/scope-report.controller";
import { conversationIdParamSchema, listScopeReportsQuerySchema, workspaceIdParamSchema } from "./dtos";
import { scopeModerationService } from "./moderation.container";

const controller = createScopeReportController(scopeModerationService);
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

const router = Router();

/**
 * @openapi
 * /workspaces/{workspaceId}/reports:
 *   get:
 *     summary: Hàng đợi báo cáo theo phạm vi kiểm duyệt của tôi trong workspace (gộp theo đích, cursor)
 *     description: |
 *       OWNER/ADMIN → kênh public + người dùng + kênh public; MANAGER kênh private → tin kênh của mình;
 *       OWNER/ADMIN nhóm chat → nhóm của mình. Không phạm vi nào → 403 PERM_001. `preview` chỉ khi đọc được phạm vi; không có reporterId.
 *     tags: [Reports]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:workspaceId/reports",
  ...M,
  validateParams(workspaceIdParamSchema),
  requireWorkspaceRole("MEMBER"),
  validateQuery(listScopeReportsQuerySchema),
  controller.listForWorkspace
);

/**
 * @openapi
 * /conversations/{conversationId}/reports:
 *   get:
 *     summary: Hàng đợi báo cáo của MỘT nhóm chat (OWNER/ADMIN nhóm)
 *     tags: [Reports]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/conversations/:conversationId/reports",
  ...M,
  validateParams(conversationIdParamSchema),
  requireScope("CONVERSATION", "conversationId", "conversation.member.remove"),
  validateQuery(listScopeReportsQuerySchema),
  controller.listForConversation
);

export default router;
