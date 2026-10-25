import { Router } from "express";
import { authenticateToken, requirePermission, validateBody, validateQuery } from "../../core/middlewares";
import { createGroupConversationService } from "../conversations/public";
import { AdminConversationsService } from "./admin-conversations.service";
import { createAdminConversationsController } from "./admin-conversations.controller";
import { adminDissolveSchema, adminListConversationsQuerySchema } from "./admin-conversations.validators";

const router = Router();

// ── DI wiring (be.md §1, pattern Flat) ──────────────────────────────────────
const service = new AdminConversationsService(createGroupConversationService());
const controller = createAdminConversationsController(service);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/conversations:
 *   get:
 *     summary: Danh bạ hội thoại nhóm trong workspace (admin — CHỈ số liệu, không title/tên thành viên)
 *     tags: [Admin/Conversations]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/admin/workspaces/:workspaceId/conversations",
  authenticateToken,
  requirePermission("workspace:view"),
  validateQuery(adminListConversationsQuerySchema),
  controller.list
);

/**
 * @openapi
 * /admin/conversations/{id}/dissolve:
 *   post:
 *     summary: Giải tán hội thoại nhóm cấp nền tảng (D-06 — chỉ từ báo cáo, bắt buộc lý do)
 *     tags: [Admin/Conversations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/admin/conversations/:id/dissolve",
  authenticateToken,
  requirePermission("moderation:update"),
  validateBody(adminDissolveSchema),
  controller.dissolve
);

export default router;
