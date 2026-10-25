import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { authenticateToken, apiLimiter, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { runtimeConfig } from "../../core/config/runtime-config";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { getLiveKit } from "../../infrastructure/media";
import { getCallsContainer } from "./calls.container";
import { createCallsController } from "./controllers/calls.controller";
import {
  activeCallQuerySchema,
  callIdParamSchema,
  createCallSchema,
  deviceActionSchema,
  endCallSchema,
  handSchema,
  hostActionBodySchema,
  hostActionParamsSchema,
  joinCallSchema,
  leaveRoomSchema,
  listCallsQuerySchema,
  ringAckSchema,
  screenShareSchema,
  voicePreviewParamsSchema,
} from "./dtos";
import { callError } from "./services/call-scope.resolver";

const controller = createCallsController(getCallsContainerLazy());

/** Container dựng lười lúc có request đầu tiên (test thay container bằng `setCallsContainerForTests` TRƯỚC request). */
function getCallsContainerLazy() {
  return new Proxy({} as ReturnType<typeof getCallsContainer>, {
    get: (_t, key) => (getCallsContainer() as unknown as Record<PropertyKey, unknown>)[key],
  });
}

/**
 * Cờ `voice` tắt HOẶC chưa cấu hình máy chủ media → 503 `CALL_012` (khác `requireFeature` trả 404 `CFG_005`):
 * README CL-19 cần client ẩn nút gọi theo mã lỗi này. `getLiveKit().isConfigured()` là `false` với `NoopMediaServer`.
 */
async function requireCallsEnabled(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  const enabled = await runtimeConfig.isFeatureEnabled(MODULES.VOICE);
  if (!enabled || !getLiveKit().isConfigured()) return next(callError(ErrorCode.CALL_012, 503));
  next();
}

// `A` = authenticateToken → cờ voice + LiveKit → apiLimiter (be.md §4).
const A = [authenticateToken, requireCallsEnabled, apiLimiter] as const;
const byUser = (req: Request): string | null => req.user?.id ?? null;
const byUserAndCall = (req: Request): string | null => (req.user?.id && req.params.id ? `${req.user.id}:${req.params.id}` : null);

const router = Router();

/**
 * @openapi
 * /calls:
 *   post:
 *     summary: Tạo cuộc gọi RING trong hội thoại (hoặc tham gia cuộc đang có); idempotent theo clientCallId
 *     description: 201 khi tạo mới; 200 khi replay clientCallId hoặc `joined=true` (nhóm đang có cuộc gọi thật). Không token khi mọi người được gọi đều bận (ENDED/BUSY).
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/calls",
  ...A,
  scopeLimiter("call-create", byUser, [{ max: LIMITS.call.createRatePerMinute, windowSeconds: 60 }], ErrorCode.CALL_009),
  validateBody(createCallSchema),
  controller.create
);

/**
 * @openapi
 * /calls/active:
 *   get:
 *     summary: Cuộc gọi đang diễn ra trong phạm vi (banner "Đang có cuộc gọi — Tham gia")
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/calls/active", ...A, validateQuery(activeCallQuerySchema), controller.getActive);

/**
 * @openapi
 * /calls/{id}:
 *   get:
 *     summary: Chi tiết cuộc gọi kèm myActions (server tính)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/calls/:id", ...A, validateParams(callIdParamSchema), controller.getById);

/**
 * @openapi
 * /calls/{id}/answer:
 *   post:
 *     summary: Trả lời cuộc gọi (compare-and-set; thiết bị thua nhận 409 CALL_006 answeredElsewhere)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/calls/:id/answer", ...A, validateParams(callIdParamSchema), validateBody(deviceActionSchema), controller.answer);

/**
 * @openapi
 * /calls/{id}/decline:
 *   post:
 *     summary: Từ chối cuộc gọi (máy khác đã nhận → 200 ignored=true)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/calls/:id/decline", ...A, validateParams(callIdParamSchema), validateBody(deviceActionSchema), controller.decline);

/**
 * @openapi
 * /calls/{id}/cancel:
 *   post:
 *     summary: Người gọi huỷ khi đang đổ chuông
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/calls/:id/cancel", ...A, validateParams(callIdParamSchema), controller.cancel);

/**
 * @openapi
 * /calls/{id}/ack:
 *   post:
 *     summary: "Thiết bị xác nhận cuộc gọi tới đã hiện/đang đổ chuông (người gọi đổi Đang gọi thành Đang đổ chuông)"
 *     description: "Body { deviceId, via: PUSH|SOCKET }. Người được gọi INVITED/RINGING → 200 { ok, acked:true } (lần đầu phát call:participant-updated có ringAckedAt); trạng thái khác → 200 { acked:false } no-op; không phải participant → 403 CALL_014; đã kết thúc → 410 CALL_005."
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/calls/:id/ack",
  ...A,
  scopeLimiter("call-ack", byUserAndCall, [{ max: 20, windowSeconds: 60 }]),
  validateParams(callIdParamSchema),
  validateBody(ringAckSchema),
  controller.ack
);

/**
 * @openapi
 * /calls/{id}/join:
 *   post:
 *     summary: Tham gia cuộc gọi đang diễn ra
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/calls/:id/join", ...A, validateParams(callIdParamSchema), validateBody(joinCallSchema), controller.join);

/**
 * @openapi
 * /calls/{id}/leave:
 *   post:
 *     summary: Rời cuộc gọi (idempotent). Phòng thoại kênh — chủ phòng có thể chuyển quyền (transferToUserId) hoặc kết thúc cho mọi người (endForEveryone)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/calls/:id/leave", ...A, validateParams(callIdParamSchema), validateBody(leaveRoomSchema), controller.leave);

/**
 * @openapi
 * /calls/{id}/end:
 *   post:
 *     summary: "Kết thúc cuộc gọi (1-1: mọi người đã vào; nhóm: người gọi hoặc OWNER/ADMIN với forEveryone)"
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/calls/:id/end", ...A, validateParams(callIdParamSchema), validateBody(endCallSchema), controller.end);

/**
 * @openapi
 * /calls/{id}/token:
 *   post:
 *     summary: Gia hạn/cấp lại token LiveKit (TTL ngắn, chỉ để kết nối)
 *     description: Phòng thoại kênh (mode ROOM) — quyền phát lấy từ DB (người bị chặn mic không có MICROPHONE); kênh/nhóm đã lưu trữ → 409 CALL_018; đã bị mời ra/không còn trong phòng → 403 CALL_014.
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/calls/:id/token",
  ...A,
  scopeLimiter("call-token", byUser, [{ max: LIMITS.call.tokenRatePerMinute, windowSeconds: 60 }]),
  validateParams(callIdParamSchema),
  controller.token
);

/**
 * @openapi
 * /me/active-call:
 *   get:
 *     summary: Cuộc gọi hiện tại của tôi (nguồn sự thật khi app mở lại)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/active-call", ...A, controller.myActive);

/**
 * @openapi
 * /me/calls:
 *   get:
 *     summary: Lịch sử cuộc gọi (cursor; filter all|missed)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/calls", ...A, validateQuery(listCallsQuerySchema), controller.history);

/**
 * @openapi
 * /channels/{id}/voice:
 *   get:
 *     summary: Xem trước phòng thoại của kênh VOICE (ai đang trong phòng, số chỗ còn lại, tôi vào được không)
 *     description: Không thấy kênh → 404 CALL_001; kênh không phải VOICE → 400 CALL_013.
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/channels/:id/voice", ...A, validateParams(voicePreviewParamsSchema), controller.voicePreview);

/**
 * @openapi
 * /calls/{id}/hand:
 *   post:
 *     summary: Giơ/hạ tay trong phòng thoại kênh (idempotent, thứ tự theo handRaisedAt do server đặt)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/calls/:id/hand",
  ...A,
  scopeLimiter("call-hand", byUserAndCall, [{ max: 20, windowSeconds: 60 }]),
  validateParams(callIdParamSchema),
  validateBody(handSchema),
  controller.hand
);

/**
 * @openapi
 * /calls/{id}/screen-share:
 *   post:
 *     summary: Bật/tắt chia sẻ màn hình (một người/phòng; người khác đang chia sẻ → 409 CALL_017)
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/calls/:id/screen-share", ...A, validateParams(callIdParamSchema), validateBody(screenShareSchema), controller.screenShare);

/**
 * @openapi
 * /calls/{id}/host/{action}:
 *   post:
 *     summary: Thao tác của chủ phòng (invite-speak, mute-request, block-audio, unblock-audio, end-share, remove, transfer, end)
 *     description: expectedVersion lệch → 409 CALL_011; không phải chủ phòng → 403 CALL_015; đích không trong phòng → 403 CALL_014; chuyển chủ không hợp lệ → 400 CALL_019.
 *     tags: [Calls]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/calls/:id/host/:action",
  ...A,
  scopeLimiter("call-host", byUser, [{ max: LIMITS.voice.hostActionPerMinute, windowSeconds: 60 }]),
  validateParams(hostActionParamsSchema),
  validateBody(hostActionBodySchema),
  controller.hostAction
);

export default router;
