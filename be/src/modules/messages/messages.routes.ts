import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  authenticateToken,
  apiLimiter,
  validateBody,
  validateQuery,
  validateParams,
  requireFeature,
  scopeLimiter,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { requireMessageScope } from "./middlewares/require-message-scope";
import { PrismaMessageRepository } from "./repositories/message.repository.prisma";
import { PrismaReactionRepository } from "./repositories/reaction.repository.prisma";
import { PrismaMessageHideRepository } from "./repositories/message-hide.repository.prisma";
import { MessageService } from "./services/message.service";
import { MessageInteractionService } from "./services/message-interaction.service";
import { MessageForwardService } from "./services/message-forward.service";
import { PinsQueryService } from "./services/pins-query.service";
import { PrismaPinSupportRepository } from "./repositories/pin-support.repository.prisma";
import { SystemMessageService } from "./services/system-message.service";
import { createMessageController } from "./controllers/message.controller";
import { createMessageInteractionController } from "./controllers/message-interaction.controller";
import {
  sendMessageSchema,
  listMessagesQuerySchema,
  editMessageSchema,
  forwardMessageSchema,
  scopeParamsSchema,
  messageIdParamSchema,
  reactionParamsSchema,
  reactionsListQuerySchema,
  deleteMessageSchema,
  pinsQuerySchema,
} from "./dtos";
import type { MessageScopeTypeValue } from "./entities/message.interface";

// ── DI wiring (be.md §1) ─────────────────────────────────────────────────────
const messageRepo = new PrismaMessageRepository();
const reactionRepo = new PrismaReactionRepository();
const hideRepo = new PrismaMessageHideRepository();

/** Export cho `public.ts` (`createSystemMessageService()`) dùng LẠI cùng 1 instance thay vì `new` lần nữa mỗi lần module khác gọi factory. */
export const systemMessageService = new SystemMessageService(messageRepo);

const messageService = new MessageService(messageRepo, reactionRepo, hideRepo);
const interactionService = new MessageInteractionService(messageRepo, reactionRepo, hideRepo, systemMessageService);
const forwardService = new MessageForwardService(messageService, messageRepo);

// p1-09 §5.3 — danh sách ghim có cursor/`meta.total`/`meta.max`, lọc tin bị ẩn (bọc `interactionService.listPinned`).
const pinsService = new PinsQueryService(interactionService, new PrismaPinSupportRepository());

const messageController = createMessageController(messageService);
const interactionController = createMessageInteractionController(interactionService, forwardService, pinsService);

// `M` = authenticateToken → isModuleEnabled("communication") → apiLimiter (be.md §4).
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

const sendRateLimiter = scopeLimiter(
  "msg",
  (req) => (req.user ? `${req.user.id}:${req.params.scopeType}:${req.params.scopeId}` : null),
  [LIMITS.message.rateBurst, LIMITS.message.rateSustained]
);
const reactionRateLimiter = scopeLimiter("reaction", (req) => req.user?.id ?? null, [LIMITS.message.rateReaction]);
const forwardRateLimiter = scopeLimiter("forward", (req) => req.user?.id ?? null, [LIMITS.message.rateForward]);

const router = Router();

/**
 * @openapi
 * /scopes/{scopeType}/{scopeId}/messages:
 *   get:
 *     summary: Danh sách tin nhắn (cursor beforeSeq/afterSeq/around)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/scopes/:scopeType/:scopeId/messages",
  ...M,
  validateParams(scopeParamsSchema),
  validateQuery(listMessagesQuerySchema),
  requireMessageScope("read"),
  messageController.list
);

/**
 * @openapi
 * /scopes/{scopeType}/{scopeId}/messages:
 *   post:
 *     summary: Gửi tin nhắn (idempotent theo clientMessageId)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/scopes/:scopeType/:scopeId/messages",
  ...M,
  validateParams(scopeParamsSchema),
  validateBody(sendMessageSchema),
  requireMessageScope("write"),
  sendRateLimiter,
  messageController.send
);

/**
 * @openapi
 * /scopes/{scopeType}/{scopeId}/pins:
 *   get:
 *     summary: Danh sách tin đã ghim trong scope (pinnedAt desc, cursor)
 *     description: |
 *       Alias: `GET /channels/{id}/pins`, `GET /conversations/{id}/pins`. Query `cursor`, `limit` (mặc định 30 ≥ pinMax nên
 *       một trang đủ). `data` = `MessageView[]` kèm `pinnedByUser {id,name}`; `meta { nextCursor, hasMore, limit, total, max }`.
 *       Hội thoại: bỏ tin trước `hiddenBeforeSeq` và tin `MessageHide` của người xem.
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/scopes/:scopeType/:scopeId/pins",
  ...M,
  validateParams(scopeParamsSchema),
  requireMessageScope("read"),
  validateQuery(pinsQuerySchema),
  interactionController.listPinned
);

/**
 * @openapi
 * /messages/{id}:
 *   get:
 *     summary: Chi tiết 1 tin nhắn (tin gốc ở kênh kèm threadRecordId (= Thread.id)/replyCount/lastReplyAt/lastReplierIds/lastReplySeq nếu đã có thread)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: MessageView }
 *       "404": { description: Không tồn tại hoặc không có quyền đọc (trung tính) }
 */
router.get("/messages/:id", ...M, validateParams(messageIdParamSchema), messageController.get);
/**
 * @openapi
 * /messages/{id}:
 *   patch:
 *     summary: Sửa nội dung/mention trong cửa sổ 15 phút (expectedVersion, chỉ tác giả)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: MessageView sau khi sửa }
 *       "400": { description: MSG_008 nhắc tên không hợp lệ }
 *       "403": { description: MSG_009 không phải tác giả / tin hệ thống }
 *       "409": { description: MSG_003 quá hạn sửa · MSG_006 đã thu hồi · RES_003 version lệch }
 */
router.patch(
  "/messages/:id",
  ...M,
  validateParams(messageIdParamSchema),
  validateBody(editMessageSchema),
  messageController.edit
);
/**
 * @openapi
 * /messages/{id}:
 *   delete:
 *     summary: Thu hồi tin (tombstone, tác giả) — reply/thread vẫn mở được
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ id, seq, deletedAt } (idempotent)" }
 *       "403": { description: Không phải tác giả }
 */
router.delete(
  "/messages/:id",
  ...M,
  validateParams(messageIdParamSchema),
  validateBody(deleteMessageSchema),
  messageController.recall
);

/**
 * @openapi
 * /messages/{id}/hide:
 *   post:
 *     summary: Ẩn tin phía tôi (idempotent, đồng bộ đa thiết bị qua message:hidden)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ messageId, hidden: true }" }
 */
/**
 * @openapi
 * /messages/{id}/hide:
 *   delete:
 *     summary: Bỏ ẩn tin phía tôi
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ messageId, hidden: false }" }
 */
router.post("/messages/:id/hide", ...M, validateParams(messageIdParamSchema), interactionController.hide);
router.delete("/messages/:id/hide", ...M, validateParams(messageIdParamSchema), interactionController.unhide);

/**
 * @openapi
 * /messages/{id}/reactions/{emoji}:
 *   put:
 *     summary: Thả cảm xúc (idempotent, tối đa 20 loại/tin — scopeLimiter 30/10s)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: emoji, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ messageId, emoji, count, me }" }
 *       "400": { description: MSG_013 emoji không hợp lệ }
 *       "409": { description: MSG_014 quá nhiều loại · MSG_006 tin đã thu hồi }
 *       "429": { description: RATE_002 }
 */
router.put(
  "/messages/:id/reactions/:emoji",
  ...M,
  validateParams(reactionParamsSchema),
  reactionRateLimiter,
  interactionController.react
);
/**
 * @openapi
 * /messages/{id}/reactions/{emoji}:
 *   delete:
 *     summary: Gỡ cảm xúc của tôi (idempotent)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: emoji, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ messageId, emoji, count, me }" }
 */
router.delete(
  "/messages/:id/reactions/:emoji",
  ...M,
  validateParams(reactionParamsSchema),
  interactionController.unreact
);
/**
 * @openapi
 * /messages/{id}/reactions:
 *   get:
 *     summary: Ai đã thả cảm xúc (cursor, lọc theo emoji)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: emoji, schema: { type: string } }
 *       - { in: query, name: cursor, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       "200": { description: "{ userId, emoji, createdAt }[] (cursor)" }
 */
router.get(
  "/messages/:id/reactions",
  ...M,
  validateParams(messageIdParamSchema),
  validateQuery(reactionsListQuerySchema),
  interactionController.listReactors
);

/**
 * @openapi
 * /messages/{id}/pin:
 *   post:
 *     summary: Ghim tin (kênh tối đa 20, hội thoại tối đa 10)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ messageId, pinned, pinnedAt, pinnedBy }" }
 *       "403": { description: Không có quyền ghim }
 *       "409": { description: MSG_010 quá giới hạn · MSG_006 tin đã thu hồi }
 */
/**
 * @openapi
 * /messages/{id}/pin:
 *   delete:
 *     summary: Bỏ ghim tin
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ messageId, pinned: false }" }
 *       "403": { description: Không có quyền ghim }
 */
router.post("/messages/:id/pin", ...M, validateParams(messageIdParamSchema), interactionController.pin);
router.delete("/messages/:id/pin", ...M, validateParams(messageIdParamSchema), interactionController.unpin);

/**
 * @openapi
 * /messages/{id}/forward:
 *   post:
 *     summary: Chuyển tiếp tới nhiều đích (forwardRequestId idempotent, scopeLimiter 20/phút)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       "200": { description: "{ results: [{ target, status: SENT|DENIED|FAILED, messageId?, code? }] }" }
 *       "409": { description: MSG_015 nguồn không chuyển tiếp được }
 *       "429": { description: RATE_002 }
 */
router.post(
  "/messages/:id/forward",
  ...M,
  validateParams(messageIdParamSchema),
  validateBody(forwardMessageSchema),
  forwardRateLimiter,
  interactionController.forward
);

export default router;

/**
 * @openapi
 * /channels/{id}/messages:
 *   get:
 *     summary: Alias của GET /scopes/CHANNEL/{id}/messages
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: Alias của POST /scopes/CHANNEL/{id}/messages (+ threadRootId để trả lời trong thread)
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 * /channels/{id}/pins:
 *   get:
 *     summary: Alias của GET /scopes/CHANNEL/{id}/pins
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 * /conversations/{id}/messages:
 *   get:
 *     summary: Alias của GET /scopes/CONVERSATION/{id}/messages
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: Alias của POST /scopes/CONVERSATION/{id}/messages
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 * /conversations/{id}/pins:
 *   get:
 *     summary: Alias của GET /scopes/CONVERSATION/{id}/pins
 *     tags: [Messages]
 *     security: [{ BearerAuth: [] }]
 */

const aliasIdParamSchema = z.object({ id: objectIdSchema });

/**
 * be.md §1 — router factory dùng bởi `router.ts` (composition root) để mount
 * alias đọc dễ (`/channels/:id/messages`, `/conversations/:id/messages`)
 * KHÔNG lặp lại nghiệp vụ — chỉ ánh xạ `:id` route param sang
 * `scopeId`/`scopeType` cố định rồi tái sử dụng đúng controller/middleware
 * ở trên. `modules/channels`/`modules/conversations` KHÔNG import gì từ
 * `modules/messages` để mount cái này — `router.ts` tự gọi (be.md §1 "router.ts
 * là composition root", luật "không import chéo module").
 */
export function createScopedMessageRouter(scopeType: MessageScopeTypeValue): Router {
  const r = Router();

  const injectScope = (req: Request, _res: Response, next: NextFunction): void => {
    req.params.scopeType = scopeType;
    req.params.scopeId = req.params.id;
    next();
  };

  r.get(
    "/:id/messages",
    ...M,
    validateParams(aliasIdParamSchema),
    injectScope,
    validateQuery(listMessagesQuerySchema),
    requireMessageScope("read"),
    messageController.list
  );
  r.post(
    "/:id/messages",
    ...M,
    validateParams(aliasIdParamSchema),
    injectScope,
    validateBody(sendMessageSchema),
    requireMessageScope("write"),
    sendRateLimiter,
    messageController.send
  );
  r.get(
    "/:id/pins",
    ...M,
    validateParams(aliasIdParamSchema),
    injectScope,
    requireMessageScope("read"),
    validateQuery(pinsQuerySchema),
    interactionController.listPinned
  );

  return r;
}
