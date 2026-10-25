import { Router } from "express";
import { authenticateToken, apiLimiter, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { createReportController } from "./controllers/report.controller";
import { createScopeReportController } from "./controllers/scope-report.controller";
import {
  createReportSchema,
  messageIdParamSchema,
  messageReportSchema,
  myReportsQuerySchema,
  reportIdParamSchema,
  resolveReportSchema,
} from "./dtos";
import { reportService, scopeModerationService } from "./moderation.container";

const controller = createReportController(reportService);
const scopeController = createScopeReportController(scopeModerationService);

// `M` = authenticateToken → cờ `communication` → apiLimiter (giống `messages.routes.ts`).
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

/** 20 báo cáo/giờ/người (`LIMITS.report.ratePerHour`) — vượt → 429 `MOD_006`. */
const reportRateLimiter = scopeLimiter(
  "report",
  (req) => req.user?.id ?? null,
  [{ max: LIMITS.report.ratePerHour, windowSeconds: 3600 }],
  ErrorCode.MOD_006
);

const router = Router();

/**
 * @openapi
 * /reports:
 *   post:
 *     summary: Báo cáo tin nhắn/người dùng/kênh/nhóm chat (idempotent theo người báo cáo x đích)
 *     description: |
 *       Lần đầu 201, lần sau 200 (`alreadyReported: true`). Đích không thấy/không quyền → 404 `MOD_002` (trung tính).
 *       `reason=OTHER` bắt buộc `description` >= 10 ký tự. Rate limit 20/giờ (`MOD_006`). Tự báo cáo mình → 400 `BLOCK_001`.
 *     tags: [Reports]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetType, targetId, reason]
 *             properties:
 *               targetType: { type: string, enum: [MESSAGE, USER, CHANNEL, CONVERSATION] }
 *               targetId: { type: string }
 *               reason: { type: string, enum: [SPAM, HARASSMENT, INAPPROPRIATE, SCAM, IMPERSONATION, OTHER] }
 *               description: { type: string, maxLength: 1000 }
 *               contextWorkspaceId: { type: string, description: "Báo cáo USER trong ngữ cảnh workspace" }
 *     responses:
 *       201: { description: "{ id, status, createdAt, alreadyReported: false }" }
 *       200: { description: "{ id, status, createdAt, alreadyReported: true }" }
 */
router.post("/reports", ...M, reportRateLimiter, validateBody(createReportSchema), controller.create);

/**
 * @openapi
 * /messages/{messageId}/report:
 *   post:
 *     summary: Báo cáo 1 tin nhắn (alias của POST /reports, targetType=MESSAGE)
 *     tags: [Reports]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/messages/:messageId/report",
  ...M,
  validateParams(messageIdParamSchema),
  reportRateLimiter,
  validateBody(messageReportSchema),
  controller.createForMessage
);

/**
 * @openapi
 * /me/reports:
 *   get:
 *     summary: Báo cáo tôi đã gửi (cursor) — không kèm nội dung đích
 *     tags: [Reports]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/reports", ...M, validateQuery(myReportsQuerySchema), controller.myReports);

/**
 * @openapi
 * /reports/{reportId}:
 *   get:
 *     summary: Chi tiết báo cáo (người báo cáo — chỉ báo cáo của mình — hoặc người xử lý phạm vi); không có reporterId
 *     tags: [Reports]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/reports/:reportId", ...M, validateParams(reportIdParamSchema), scopeController.getDetail);

/**
 * @openapi
 * /reports/{reportId}/resolve:
 *   post:
 *     summary: Người kiểm duyệt phạm vi xử lý cả nhóm báo cáo (REMOVE_MESSAGE | DISMISS | WARN_AUTHOR) + lý do bắt buộc
 *     description: "Lỗi: MOD_001 đã xử lý, MOD_003 hành động không áp dụng, 403 PERM_006 không phải người kiểm duyệt, 404 trung tính."
 *     tags: [Reports]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/reports/:reportId/resolve", ...M, validateParams(reportIdParamSchema), validateBody(resolveReportSchema), scopeController.resolve);

export default router;
