import { Router } from "express";
import {
  apiLimiter,
  authenticateToken,
  requireFeature,
  requireSubFeature,
  scopeLimiter,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { MODULES, SUB_FEATURES } from "../../core/constants/modules";
import { registerAnnouncementNotificationTypes } from "./announcement.notification-types";
import { PrismaAnnouncementLookupRepository, PrismaAnnouncementRepository } from "./repositories/announcement.repository.prisma";
import { AnnouncementService } from "./services/announcement.service";
import { AnnouncementReceiptsService } from "./services/announcement-receipts.service";
import { createAnnouncementController } from "./controllers/announcement.controller";
import { channelIdParamSchema, createAnnouncementSchema, messageIdParamSchema, receiptsQuerySchema } from "./dtos";

// ── DI wiring ────────────────────────────────────────────────────────────────
registerAnnouncementNotificationTypes();
const repo = new PrismaAnnouncementRepository();
const lookup = new PrismaAnnouncementLookupRepository();
const service = new AnnouncementService({ repo, lookup });
const receipts = new AnnouncementReceiptsService(repo, lookup, (channelId) => lookup.channelReaderIds(channelId));
const controller = createAnnouncementController(service, receipts);

const router = Router();

/** Cờ `communication` + cờ phụ `readConfirm` (404 `CFG_005` khi tắt) + giới hạn theo người dùng. */
const COMMON = [authenticateToken, requireFeature(MODULES.COMMUNICATION), requireSubFeature(SUB_FEATURES.READ_CONFIRM), apiLimiter] as const;

/** Xác nhận: 120 lượt/phút/người (bấm nhầm/thử lại vẫn idempotent, chỉ chặn spam). */
const confirmLimiter = scopeLimiter("announcement-confirm", (req) => req.user?.id ?? null, [{ max: 120, windowSeconds: 60 }]);
const manageLimiter = scopeLimiter("announcement-manage", (req) => req.user?.id ?? null, [{ max: 60, windowSeconds: 60 }]);

/**
 * @openapi
 * /messages/{messageId}/announcement:
 *   post:
 *     summary: Yêu cầu mọi người xác nhận đã đọc một tin trong kênh chỉ quản trị được đăng (ADMINS_ONLY)
 *     description: |
 *       Body `{ deadlineAt? }` (tương lai, tối đa 30 ngày). Cần `channel.manage` của kênh chứa tin (OWNER/ADMIN nhóm với kênh công khai, MANAGER với kênh riêng tư).
 *       Trả `AnnouncementView` — 201 khi tạo/khôi phục, 200 khi đã có yêu cầu còn hiệu lực (idempotent).
 *       Lỗi: 400 `ANN_001` (không phải kênh thông báo / không phải tin gốc), 409 `ANN_002` (quá 10 yêu cầu còn hiệu lực), 409 `CH_004` (kênh đã lưu trữ), 404/403 theo quyền.
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/messages/:messageId/announcement", ...COMMON, validateParams(messageIdParamSchema), validateBody(createAnnouncementSchema), manageLimiter, controller.create);

/**
 * @openapi
 * /messages/{messageId}/announcement:
 *   get:
 *     summary: Trạng thái yêu cầu xác nhận của một tin (theo góc nhìn người xem)
 *     description: Trả `{ messageId, channelId, requestedBy, createdAt, deadlineAt, expired, confirmedByMe, canViewReceipts, confirmedCount? }`; 404 khi không có/đã huỷ.
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/messages/:messageId/announcement", ...COMMON, validateParams(messageIdParamSchema), controller.get);

/**
 * @openapi
 * /messages/{messageId}/announcement:
 *   delete:
 *     summary: Huỷ yêu cầu xác nhận (người yêu cầu hoặc quản trị kênh) — 204, idempotent
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/messages/:messageId/announcement", ...COMMON, validateParams(messageIdParamSchema), manageLimiter, controller.cancel);

/**
 * @openapi
 * /messages/{messageId}/announcement/confirm:
 *   post:
 *     summary: Tôi đã đọc — tạo biên nhận (idempotent, không suy từ mốc đọc)
 *     description: 'Trả `{ confirmedAt }`. Lỗi: 410 `ANN_003` (đã huỷ hoặc hết hạn), 404 (không đọc được kênh / không có yêu cầu).'
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/messages/:messageId/announcement/confirm", ...COMMON, validateParams(messageIdParamSchema), confirmLimiter, controller.confirm);

/**
 * @openapi
 * /messages/{messageId}/announcement/receipts:
 *   get:
 *     summary: Danh sách đã/chưa xác nhận (người yêu cầu + quản trị kênh)
 *     description: |
 *       Query `status=confirmed|pending` (mặc định pending), `cursor`, `limit`. Trả `data: [{ userId, name, avatarUrl, confirmedAt? }]`,
 *       `meta: { nextCursor, hasMore, limit, confirmedCount, audienceCount }` — audience = người ĐANG đọc được kênh trừ người yêu cầu.
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/messages/:messageId/announcement/receipts", ...COMMON, validateParams(messageIdParamSchema), validateQuery(receiptsQuerySchema), controller.listReceipts);

/**
 * @openapi
 * /channels/{channelId}/announcements:
 *   get:
 *     summary: Yêu cầu xác nhận chưa huỷ của một kênh (kèm confirmedByMe) — dựng huy hiệu "Cần xác nhận" trên tin
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/channels/:channelId/announcements", ...COMMON, validateParams(channelIdParamSchema), controller.listByChannel);

export default router;
