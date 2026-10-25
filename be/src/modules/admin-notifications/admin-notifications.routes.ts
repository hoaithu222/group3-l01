import { Router } from "express";
import { authenticateToken, requirePermission, validateQuery } from "../../core/middlewares";
import { AdminNotificationsService } from "./admin-notifications.service";
import { createAdminNotificationsController } from "./admin-notifications.controller";
import { notificationStatsQuerySchema } from "./admin-notifications.validators";

const router = Router();
const controller = createAdminNotificationsController(new AdminNotificationsService());

router.use(authenticateToken);

/**
 * @openapi
 * /admin/notifications/stats:
 *   get:
 *     summary: Số liệu thông báo tổng hợp (push gửi/lỗi/bị chặn, fan-out p95, mục hộp thư) — chỉ chỉ số gộp
 *     tags: [AdminNotifications]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/stats", requirePermission("system-config:view"), validateQuery(notificationStatsQuerySchema), controller.stats);

export default router;
