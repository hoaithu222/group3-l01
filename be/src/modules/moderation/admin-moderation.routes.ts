import { Router } from "express";
import { authenticateToken, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { createAdminModerationController } from "./controllers/admin-moderation.controller";
import { adminActionSchema, adminListReportsQuerySchema, adminRemoveMessageSchema, messageIdParamSchema, reportIdParamSchema } from "./dtos";
import { platformModerationService } from "./moderation.container";

const controller = createAdminModerationController(platformModerationService);
const router = Router();

/**
 * @openapi
 * /admin/reports:
 *   get:
 *     summary: Hàng đợi kiểm duyệt nền tảng — gộp theo đích (moderation:view). CHỈ metadata, không nội dung riêng tư
 *     tags: [Admin/Moderation]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/reports", authenticateToken, requirePermission("moderation:view"), validateQuery(adminListReportsQuerySchema), controller.list);

/**
 * @openapi
 * /admin/reports/{reportId}:
 *   get:
 *     summary: Chi tiết nhóm báo cáo (người báo cáo, lịch sử, số liệu tác giả; tin ±3 CHỈ với kênh public)
 *     tags: [Admin/Moderation]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/reports/:reportId", authenticateToken, requirePermission("moderation:view"), validateParams(reportIdParamSchema), controller.detail);

/**
 * @openapi
 * /admin/reports/{reportId}/content:
 *   get:
 *     summary: Xem nội dung tin bị báo cáo ±3 trong kênh private/nhóm chat/1-1 (D-06 — moderation:approve, có audit + thông báo, hết hạn 24 h)
 *     description: "Lỗi: MOD_004 không phải đích tin nhắn/không private, MOD_005 hết hạn."
 *     tags: [Admin/Moderation]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/admin/reports/:reportId/content",
  authenticateToken,
  requirePermission("moderation:approve"),
  validateParams(reportIdParamSchema),
  controller.content
);

/**
 * @openapi
 * /admin/reports/{reportId}:
 *   patch:
 *     summary: Xử lý nhóm báo cáo (DISMISS|REMOVE_CONTENT|WARN_AUTHOR|LOCK_AUTHOR|ARCHIVE_CHANNEL|DISSOLVE_CONVERSATION) + lý do
 *     description: "LOCK_AUTHOR cần thêm user:update. Lỗi: MOD_001 đã xử lý, MOD_003 hành động không áp dụng."
 *     tags: [Admin/Moderation]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/admin/reports/:reportId",
  authenticateToken,
  requirePermission("moderation:update"),
  validateParams(reportIdParamSchema),
  validateBody(adminActionSchema),
  controller.act
);

/**
 * @openapi
 * /admin/messages/{messageId}/remove:
 *   post:
 *     summary: Gỡ 1 tin nhắn cấp nền tảng (moderation:update, lý do bắt buộc)
 *     tags: [Admin/Moderation]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/admin/messages/:messageId/remove",
  authenticateToken,
  requirePermission("moderation:update"),
  validateParams(messageIdParamSchema),
  validateBody(adminRemoveMessageSchema),
  controller.removeMessage
);

export default router;
