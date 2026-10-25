import { Router } from "express";
import { authenticateToken, requirePermission, validateQuery } from "../../core/middlewares";
import { AuditService } from "./audit-log.service";
import { createAuditLogController } from "./audit-log.controller";
import { listAuditLogQuerySchema } from "./audit-log.validators";

const router = Router();

const auditService = new AuditService();
const controller = createAuditLogController(auditService);

router.use(authenticateToken);

/**
 * @openapi
 * /audit-logs:
 *   get:
 *     summary: Danh sách nhật ký thao tác (cursor pagination)
 *     description: >
 *       Mỗi bản ghi có `actor { id, name, role }` (tra batch từ User; `null` khi user đã bị xoá
 *       cứng — tài khoản ẩn danh hoá vẫn có `actor.name` = "Tài khoản đã xoá"), giữ nguyên
 *       `actorId`/`actorRole`. Thời gian ở trường `at`. Meta: `{ nextCursor, hasMore, limit }`.
 *     tags: [AuditLog]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: cursor, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *       - { in: query, name: actorId, schema: { type: string } }
 *       - { in: query, name: action, description: "1 mã hoặc nhiều mã ngăn bằng dấu phẩy (lọc IN)", schema: { type: string } }
 *       - { in: query, name: targetType, schema: { type: string } }
 *       - { in: query, name: targetId, schema: { type: string } }
 *       - { in: query, name: workspaceId, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 */
router.get(
  "/",
  requirePermission("audit-log:view"),
  validateQuery(listAuditLogQuerySchema),
  controller.list
);

export default router;
export { auditService };
