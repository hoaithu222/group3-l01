import { Router, type NextFunction, type Request, type Response } from "express";
import {
  apiLimiter,
  authenticateToken,
  idempotencyKey,
  requireFeature,
  requireSubFeature,
  scopeLimiter,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { MODULES, SUB_FEATURES } from "../../core/constants/modules";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { z } from "zod";
import { getChatExtensionsContainer } from "./chat-extensions.container";
import { createMessageConversionController } from "./controllers/message-conversion.controller";
import { createMessageReminderController } from "./controllers/message-reminder.controller";
import { createPollController } from "./controllers/poll.controller";
import { createScheduledMessageController } from "./controllers/scheduled-message.controller";
import {
  createPollSchema,
  createReminderSchema,
  createScheduledSchema,
  listMyRemindersQuerySchema,
  listMyScheduledQuerySchema,
  messageParamsSchema,
  pollParamsSchema,
  reminderParamsSchema,
  scheduledParamsSchema,
  scopeParamsSchema,
  toResourceSchema,
  toTaskSchema,
  updateScheduledSchema,
  voteSchema,
  votersQuerySchema,
} from "./dtos";
import type { ChatScopeType } from "./entities/chat-extensions.types";

const container = getChatExtensionsContainer();
const polls = createPollController(container);
const scheduled = createScheduledMessageController(container);
const reminders = createMessageReminderController(container);
const conversion = createMessageConversionController(container);

/**
 * Mỗi nhóm route: đăng nhập → phân hệ `communication` → cờ phụ của tiện ích (tắt → 404 `CFG_005`, DU-05) → rate limit theo user. Quyền từng thao tác do SERVICE kiểm qua cổng `IMessageSendPort`
 * (đọc/ghi phạm vi theo `MessageScope`): không thấy → 404 trung tính, thấy nhưng không được ghi → 403 `MSG_004`.
 */
const base = (flag: (typeof SUB_FEATURES)[keyof typeof SUB_FEATURES]) => [authenticateToken, requireFeature(MODULES.COMMUNICATION), requireSubFeature(flag), apiLimiter] as const;
const POLLS = base(SUB_FEATURES.POLLS);
const SCHEDULED = base(SUB_FEATURES.SCHEDULED_MESSAGES);
const REMINDERS = base(SUB_FEATURES.MESSAGE_REMINDERS);
const TO_TASK = [authenticateToken, requireFeature(MODULES.COMMUNICATION), requireSubFeature(SUB_FEATURES.MESSAGE_TO_TASK), apiLimiter] as const;
const TO_RESOURCE = [authenticateToken, requireFeature(MODULES.COMMUNICATION), requireSubFeature(SUB_FEATURES.MESSAGE_TO_RESOURCE), apiLimiter] as const;

const byUser = (req: Request): string | null => req.user?.id ?? null;
/** Tạo khảo sát dùng CHUNG bộ đếm `msg` với gửi tin (cùng khoá người+phạm vi): khảo sát cũng là tin, không lách được hạn mức chống spam. */
const sendRateLimiter = scopeLimiter("msg", (req) => (req.user ? `${req.user.id}:${req.params.scopeType}:${req.params.scopeId}` : null), [LIMITS.message.rateBurst, LIMITS.message.rateSustained]);

const router = Router();

/**
 * @openapi
 * /scopes/{scopeType}/{scopeId}/polls:
 *   post:
 *     summary: Tạo khảo sát trong kênh/hội thoại (tin kind=POLL; 2–10 lựa chọn, một/nhiều đáp án, ẩn danh, hạn chốt; idempotent theo clientMessageId). Alias /channels/{id}/polls, /conversations/{id}/polls
 *     tags: ["Chat · Khảo sát"]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/scopes/:scopeType/:scopeId/polls", ...POLLS, validateParams(scopeParamsSchema), validateBody(createPollSchema), sendRateLimiter, polls.create);

/**
 * @openapi
 * /polls/{pollId}:
 *   get:
 *     summary: Chi tiết khảo sát (số phiếu, myOptionIds của người gọi; khảo sát ẩn danh không bao giờ trả người bầu)
 *     tags: ["Chat · Khảo sát"]
 *     security: [{ BearerAuth: [] }]
 * /polls/{pollId}/vote:
 *   put:
 *     summary: Bầu/đổi phiếu (thay TOÀN BỘ lựa chọn của mình) — POLL_003 chọn nhiều ở khảo sát một đáp án, POLL_004 đã kết thúc, POLL_005 không thấy
 *     tags: ["Chat · Khảo sát"]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Bỏ phiếu của mình
 *     tags: ["Chat · Khảo sát"]
 *     security: [{ BearerAuth: [] }]
 * /polls/{pollId}/close:
 *   post:
 *     summary: Đóng khảo sát sớm (người tạo hoặc moderator phạm vi; đã đóng → trả nguyên trạng)
 *     tags: ["Chat · Khảo sát"]
 *     security: [{ BearerAuth: [] }]
 * /polls/{pollId}/voters:
 *   get:
 *     summary: Người bầu một lựa chọn (?optionId, cursor) — 403 POLL_006 với khảo sát ẩn danh (kể cả người tạo)
 *     tags: ["Chat · Khảo sát"]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/polls/:pollId", ...POLLS, validateParams(pollParamsSchema), polls.get);
router.put(
  "/polls/:pollId/vote",
  ...POLLS,
  validateParams(pollParamsSchema),
  validateBody(voteSchema),
  scopeLimiter("poll-vote", byUser, [LIMITS.poll.voteRate]),
  polls.vote
);
router.delete("/polls/:pollId/vote", ...POLLS, validateParams(pollParamsSchema), scopeLimiter("poll-vote", byUser, [LIMITS.poll.voteRate]), polls.unvote);
router.post("/polls/:pollId/close", ...POLLS, validateParams(pollParamsSchema), polls.close);
router.get("/polls/:pollId/voters", ...POLLS, validateParams(pollParamsSchema), validateQuery(votersQuerySchema), polls.voters);

/**
 * @openapi
 * /scopes/{scopeType}/{scopeId}/scheduled-messages:
 *   post:
 *     summary: Hẹn giờ gửi một tin (sendAt UTC trong [+1 phút, +30 ngày], timezone IANA chỉ để hiển thị; SCHED_001/002, MSG_001/002/004/005/007/008). Alias /channels/{id}/scheduled-messages, /conversations/{id}/scheduled-messages
 *     tags: ["Chat · Tin hẹn giờ"]
 *     security: [{ BearerAuth: [] }]
 * /me/scheduled-messages:
 *   get:
 *     summary: Tin đã hẹn của tôi (?status PENDING|FAILED|SENT|CANCELLED, ?scopeType&scopeId, cursor)
 *     tags: ["Chat · Tin hẹn giờ"]
 *     security: [{ BearerAuth: [] }]
 * /scheduled-messages/{id}:
 *   patch:
 *     summary: Sửa tin hẹn giờ còn PENDING (expectedVersion → RES_003; SCHED_003 khi đã gửi/huỷ; đổi giờ → job cũ vô hiệu)
 *     tags: ["Chat · Tin hẹn giờ"]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Huỷ tin hẹn giờ (204; SCHED_003 khi đã gửi)
 *     tags: ["Chat · Tin hẹn giờ"]
 *     security: [{ BearerAuth: [] }]
 * /scheduled-messages/{id}/send-now:
 *   post:
 *     summary: Gửi ngay tin đang hẹn → { scheduledMessage, message } (403 SCHED_004 khi không còn quyền gửi)
 *     tags: ["Chat · Tin hẹn giờ"]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/scopes/:scopeType/:scopeId/scheduled-messages",
  ...SCHEDULED,
  validateParams(scopeParamsSchema),
  validateBody(createScheduledSchema),
  scopeLimiter("sched-create", byUser, [LIMITS.scheduledMessage.createRate]),
  scheduled.create
);
router.get("/me/scheduled-messages", ...SCHEDULED, validateQuery(listMyScheduledQuerySchema), scheduled.listMine);
router.patch("/scheduled-messages/:id", ...SCHEDULED, validateParams(scheduledParamsSchema), validateBody(updateScheduledSchema), scheduled.update);
router.delete("/scheduled-messages/:id", ...SCHEDULED, validateParams(scheduledParamsSchema), scheduled.cancel);
router.post(
  "/scheduled-messages/:id/send-now",
  ...SCHEDULED,
  validateParams(scheduledParamsSchema),
  scopeLimiter("sched-send-now", byUser, [LIMITS.message.rateBurst, LIMITS.message.rateSustained]),
  scheduled.sendNow
);

/**
 * @openapi
 * /messages/{messageId}/reminders:
 *   post:
 *     summary: Nhắc lại tin tại thời điểm chọn (remindAt UTC trong [+1 phút, +365 ngày]; REMIND_001/002; 404 MSG_012 khi không đọc được tin)
 *     tags: ["Chat · Nhắc lại"]
 *     security: [{ BearerAuth: [] }]
 * /me/reminders:
 *   get:
 *     summary: Nhắc lại của tôi (?status PENDING|FIRED, cursor; preview chỉ khi tin còn đọc được lúc xem)
 *     tags: ["Chat · Nhắc lại"]
 *     security: [{ BearerAuth: [] }]
 * /reminders/{id}:
 *   delete:
 *     summary: Xoá nhắc của mình (204)
 *     tags: ["Chat · Nhắc lại"]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/messages/:messageId/reminders", ...REMINDERS, validateParams(messageParamsSchema), validateBody(createReminderSchema), reminders.create);
router.get("/me/reminders", ...REMINDERS, validateQuery(listMyRemindersQuerySchema), reminders.listMine);
router.delete("/reminders/:id", ...REMINDERS, validateParams(reminderParamsSchema), reminders.cancel);

/**
 * @openapi
 * /messages/{messageId}/to-task:
 *   post:
 *     summary: Chuyển tin thành thẻ công việc (Idempotency-Key bắt buộc; thẻ chỉ mang liên kết nguồn + trích dẫn khi bảng cùng nhóm và tin không phải 1-1; 400 VAL_001 WORKSPACE_MISMATCH)
 *     tags: ["Chat · Chuyển đổi"]
 *     security: [{ BearerAuth: [] }]
 * /messages/{messageId}/to-resource:
 *   post:
 *     summary: Lưu tệp của tin vào kho tài liệu (cùng assetId, không nhân file; 400 VAL_001 details.requiresConfirmation khi nguồn hẹp hơn nhóm đích; 501 SYS_501 khi chưa cấu hình)
 *     tags: ["Chat · Chuyển đổi"]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/messages/:messageId/to-task",
  ...TO_TASK,
  validateParams(messageParamsSchema),
  idempotencyKey("message-to-task", { required: true }),
  validateBody(toTaskSchema),
  conversion.toTask
);
router.post(
  "/messages/:messageId/to-resource",
  ...TO_RESOURCE,
  validateParams(messageParamsSchema),
  idempotencyKey("message-to-resource", { required: true }),
  validateBody(toResourceSchema),
  conversion.toResource
);

export default router;

const aliasIdParamSchema = z.object({ id: objectIdSchema });

/**
 * Router alias `/channels/:id/(polls|scheduled-messages)`, `/conversations/:id/(polls|scheduled-messages)` — gán sẵn `scopeType/scopeId` rồi dùng đúng controller/middleware ở trên
 * (cùng khuôn `createScopedMessageRouter` của `messages`). `router.ts` mount: `v1.use("/channels", createScopedExtensionRouter("CHANNEL"))`.
 */
export function createScopedExtensionRouter(scopeType: ChatScopeType): Router {
  const r = Router();
  const injectScope = (req: Request, _res: Response, next: NextFunction): void => {
    req.params.scopeType = scopeType;
    req.params.scopeId = req.params.id;
    next();
  };
  r.post("/:id/polls", ...POLLS, validateParams(aliasIdParamSchema), injectScope, validateBody(createPollSchema), sendRateLimiter, polls.create);
  r.post(
    "/:id/scheduled-messages",
    ...SCHEDULED,
    validateParams(aliasIdParamSchema),
    injectScope,
    validateBody(createScheduledSchema),
    scopeLimiter("sched-create", byUser, [LIMITS.scheduledMessage.createRate]),
    scheduled.create
  );
  return r;
}
