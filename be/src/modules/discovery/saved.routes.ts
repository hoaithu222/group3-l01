import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  apiLimiter,
  validateParams,
  validateQuery,
  requireFeature,
  scopeLimiter,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { PrismaSavedMessageRepository } from "./repositories/saved-message.repository.prisma";
import { PrismaMessageSearchRepository } from "./repositories/message-search.repository.prisma";
import { PrismaDiscoveryLookupRepository } from "./repositories/discovery-lookup.repository.prisma";
import { SavedService } from "./services/saved.service";
import { SavedMessageReaderImpl } from "./services/saved-message-reader";
import { createSavedController } from "./controllers/saved.controller";
import { savedListQuerySchema } from "./dtos";
import { registerSavedMessageReader } from "../../shared/ports/saved-message-reader.port";

// ── DI wiring ────────────────────────────────────────────────────────────────
const savedRepo = new PrismaSavedMessageRepository();
const savedService = new SavedService(savedRepo, new PrismaMessageSearchRepository(), new PrismaDiscoveryLookupRepository());
const controller = createSavedController(savedService);
// p1-04: `messages` ghép `MessageView.isSaved` qua cổng `shared/ports` (không import `discovery`) — đăng ký lúc import routes (API).
registerSavedMessageReader(new SavedMessageReaderImpl(savedRepo));

// `M` = authenticateToken → cờ `communication` → apiLimiter (giống `messages.routes.ts`).
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

const messageIdParamSchema = z.object({ messageId: objectIdSchema });
const saveRateLimiter = scopeLimiter("save", (req) => req.user?.id ?? null, [
  { max: LIMITS.saved.ratePerMinute, windowSeconds: 60 },
]);

const router = Router();

/**
 * @openapi
 * /messages/{messageId}/save:
 *   post:
 *     summary: Lưu tin nhắn cho riêng mình (idempotent; không báo tác giả)
 *     description: |
 *       200 `{ messageId, savedAt }`. 404 khi không đọc được tin/tin hệ thống/tin bị ẩn phía mình;
 *       409 `MSG_006` khi tin đã thu hồi; 409 `SRCH_004` khi đã lưu tối đa `LIMITS.saved.max` tin.
 *       Phát `saved:updated { messageId, saved:true }` tới `user:{id}` khi trạng thái đổi.
 *     tags: [Discovery]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/messages/:messageId/save", ...M, validateParams(messageIdParamSchema), saveRateLimiter, controller.save);

/**
 * @openapi
 * /messages/{messageId}/save:
 *   delete:
 *     summary: Bỏ lưu tin nhắn (idempotent, không kiểm quyền đọc để luôn bỏ lưu được)
 *     description: |
 *       200 với `data: null`. Phát `saved:updated { messageId, saved:false }` khi có bản ghi bị xoá.
 *     tags: [Discovery]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/messages/:messageId/save", ...M, validateParams(messageIdParamSchema), controller.unsave);

/**
 * @openapi
 * /me/saved:
 *   get:
 *     summary: Danh sách tin đã lưu của tôi (cursor createdAt desc; lọc scopeType/workspaceId)
 *     description: |
 *       Mỗi mục được kiểm lại quyền đọc/tombstone/ẩn khi trả. `SavedItem` khả dụng:
 *       `{ savedAt, messageId, scopeType, scopeId, workspaceId, available:true, message: MessagePreview, scope }`;
 *       không khả dụng: `{ savedAt, messageId, available:false }` (không lộ nội dung/tên phạm vi).
 *     tags: [Discovery]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/saved", ...M, validateQuery(savedListQuerySchema), controller.list);

export default router;
