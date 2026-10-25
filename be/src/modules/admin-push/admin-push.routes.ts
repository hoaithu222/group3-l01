import { Router } from "express";
import { authenticateToken, requireRoles, requirePermission, validateBody } from "../../core/middlewares";
import { ROLES } from "../../core/constants/roles";
import { createDeviceService } from "../devices/public";
import { AdminPushService } from "./admin-push.service";
import { AdminPushStatsService } from "./admin-push-stats.service";
import { createAdminPushController } from "./admin-push.controller";
import { adminPushTestSchema } from "./admin-push.validators";

const router = Router();

const service = new AdminPushService(createDeviceService());
const statsService = new AdminPushStatsService();
const controller = createAdminPushController(service, statsService);

router.use(authenticateToken);

/**
 * @openapi
 * /admin/push/status:
 *   get:
 *     summary: Trạng thái cấu hình provider push (FCM, APNs VoIP) — chỉ cờ/enum, không trả khoá/secret
 *     description: >
 *       Thay cho `GET /admin/system-config/notifications` của plan p0-06 (khoá registry
 *       `notifications` là khoá cấu hình, không phải route đọc trạng thái hạ tầng).
 *     tags: [AdminPush]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: >
 *           `{ pushEnabled, fcm: { configured }, voip: { configured, environment: SANDBOX|PRODUCTION|null } }`.
 *           `environment` là mặc định theo env `APNS_USE_SANDBOX`; endpoint APNs thật chọn theo từng token.
 *       403: { description: Thiếu quyền system-config:view }
 */
router.get("/status", requirePermission("system-config:view"), controller.getStatus);

/**
 * @openapi
 * /admin/push/stats:
 *   get:
 *     summary: Số liệu push — gửi/lỗi/bỏ qua theo lý do trong 24 giờ, token bị gỡ theo lý do trong 7 ngày (cache 60 giây)
 *     description: >
 *       Thay cho `GET /admin/system-config/notifications/stats` của plan p0-06. Đếm
 *       `NotificationRecipient.pushStatus/skipReason` và `DeviceToken.revokedAt/revokeReason`.
 *     tags: [AdminPush]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: >
 *           `{ generatedAt, push24h: { sent, failed, skipped: { total, byReason } },
 *           tokensRevoked7d: { total, byReason } }` — `byReason` thưa (chỉ lý do có phát sinh),
 *           bản ghi cũ không có lý do gộp vào `UNKNOWN`.
 *       403: { description: Thiếu quyền system-config:view }
 */
router.get("/stats", requirePermission("system-config:view"), controller.getStats);

/**
 * @openapi
 * /admin/push/test:
 *   post:
 *     summary: Gửi push thử tới 1 người dùng (chẩn đoán FCM/APNs VoIP, có audit)
 *     tags: [AdminPush]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, reason]
 *             properties:
 *               userId: { type: string, description: ObjectId người nhận }
 *               type: { type: string, enum: [message.new, call.incoming, meeting.reminder], default: message.new }
 *               reason: { type: string, minLength: 10, maxLength: 500 }
 *     responses:
 *       200:
 *         description: "`{ fcm: { sent, failed }, voip: { sent, failed } }`"
 *       400: { description: Thiếu/ngắn lý do (VAL_001) }
 *       403: { description: Cần vai trò admin và quyền system-config:update }
 *       404: { description: Người nhận chưa có thiết bị (PUSH_002) }
 *       503: { description: Push chưa cấu hình hoặc cờ push tắt (PUSH_001) }
 */
router.post(
  "/test",
  requirePermission("system-config:update"),
  requireRoles([ROLES.ADMIN]),
  validateBody(adminPushTestSchema),
  controller.sendTest
);

export default router;
