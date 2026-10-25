import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { runtimeConfig } from "../../core/config/runtime-config";
import { LIMITS } from "../../core/constants/limits";
import { MODULES } from "../../core/constants/modules";
import { apiLimiter, authenticateToken, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { requireChannelAccess } from "../../core/permission";
import { ErrorCode } from "../../core/utils/error.codes";
import { getLiveKit } from "../../infrastructure/media";
import { createPomodoroController } from "./controllers/pomodoro.controller";
import { channelParamsSchema, commandSchema, configSchema, goalSchema, historyQuerySchema, joinSchema, sessionParamsSchema } from "./dtos";
import { getPomodoroContainer } from "./pomodoro.container";
import { pomodoroError } from "./pomodoro.errors";

const router = Router();
const controller = createPomodoroController(getPomodoroContainerLazy());

/** Container dựng lười lúc có request đầu tiên (test thay container bằng `setPomodoroContainerForTests` TRƯỚC request). */
function getPomodoroContainerLazy() {
  return new Proxy({} as ReturnType<typeof getPomodoroContainer>, {
    get: (_t, key) => (getPomodoroContainer() as unknown as Record<PropertyKey, unknown>)[key],
  });
}

/**
 * `join` cần media: cờ `voice` tắt HOẶC chưa cấu hình máy chủ LiveKit → 503 `CALL_012` (cùng mã với phòng thoại kênh — app ẩn nút vào phòng theo mã này).
 * Các route chỉ-DB (snapshot, lệnh, mục tiêu) không cần LiveKit nên chỉ gắn cờ `pomodoro`.
 */
async function requireMediaEnabled(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  const enabled = await runtimeConfig.isFeatureEnabled(MODULES.VOICE);
  if (!enabled || !getLiveKit().isConfigured()) return next(pomodoroError(ErrorCode.CALL_012, 503));
  next();
}

// `A` = authenticateToken → cờ `pomodoro` (404 CFG_005 khi tắt) → apiLimiter; `read` = quyền đọc kênh (404 trung tính khi không thấy).
const A = [authenticateToken, requireFeature(MODULES.POMODORO), apiLimiter] as const;
const read = requireChannelAccess("read");
const byUserAndChannel = (req: Request): string | null => (req.user?.id && req.params.channelId ? `${req.user.id}:${req.params.channelId}` : null);
const byUser = (req: Request): string | null => req.user?.id ?? null;
const commandLimit = scopeLimiter("pomodoro-command", byUserAndChannel, [{ max: LIMITS.pomodoro.commandPerMinute, windowSeconds: 60 }]);
const path = "/channels/:channelId/pomodoro";

/**
 * @openapi
 * /channels/{channelId}/pomodoro:
 *   get:
 *     summary: Preview + phòng Pomodoro của kênh — snapshot đồng hồ theo SERVER (phaseEndsAt + serverNow), luật mic, người đang học, myActions
 *     description: Kênh chưa có phiên → snapshot WAITING ảo (sessionId null, version 0). Không thấy kênh → 404; kênh không phải POMODORO → 400 CALL_POMO_001. Cờ `pomodoro` tắt → 404 CFG_005.
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.get(path, ...A, validateParams(channelParamsSchema), read, controller.get);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/join:
 *   post:
 *     summary: Vào học — mở phiên WAITING nếu kênh chưa có, tạo/vào phòng media, cấp token với quyền publish THEO PHASE (FOCUS không có MICROPHONE)
 *     description: "200 `{ snapshot, call, token, livekitUrl, expiresAt, serverNow }`. Lỗi: CALL_004 (đang ở cuộc gọi/thiết bị khác, cần force), CALL_008 (đầy), CALL_016 (bị mời ra), CALL_018 (kênh lưu trữ), CALL_012 (voice tắt/thiếu LiveKit → 503). Rời phòng/gia hạn token dùng `POST /calls/{id}/leave|token`."
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  `${path}/join`,
  ...A,
  requireMediaEnabled,
  validateParams(channelParamsSchema),
  read,
  scopeLimiter("pomodoro-join", byUser, [{ max: LIMITS.call.createRatePerMinute, windowSeconds: 60 }], ErrorCode.CALL_009),
  validateBody(joinSchema),
  controller.join
);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/config:
 *   patch:
 *     summary: Đổi cấu hình chu kỳ — chủ phiên khi WAITING, hoặc người có `manage` kênh khi CHƯA có phiên (lưu làm mặc định của kênh)
 *     description: Phiên đã chạy → 409 CALL_POMO_003; không phải chủ phiên → 403 CALL_POMO_004; expectedVersion lệch → 409 RES_003. Khoảng giá trị theo `capabilities.limits.pomodoro`.
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(`${path}/config`, ...A, validateParams(channelParamsSchema), read, commandLimit, validateBody(configSchema), controller.updateConfig);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/start:
 *   post:
 *     summary: Bắt đầu phiên (chủ phiên khi WAITING, hoặc người đầu tiên bấm khi kênh chưa có phiên) — vào FOCUS ngay
 *     description: Body { commandId (UUID), expectedVersion (0 khi chưa có phiên) }. Cùng commandId gửi lại trả cùng kết quả, version không tăng lần 2 (idempotency 1 giờ). Đã có phiên chạy → 409 CALL_POMO_002.
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.post(`${path}/start`, ...A, validateParams(channelParamsSchema), read, commandLimit, validateBody(commandSchema), controller.start);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/pause:
 *   post:
 *     summary: Tạm dừng (chủ phiên) — đóng băng thời gian còn lại; không phải chủ phiên → 403 CALL_POMO_004, sai giai đoạn → 409 CALL_POMO_005
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.post(`${path}/pause`, ...A, validateParams(channelParamsSchema), read, commandLimit, validateBody(commandSchema), controller.pause);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/resume:
 *   post:
 *     summary: Tiếp tục sau tạm dừng (chủ phiên) — chạy tiếp giai đoạn trước đó với thời gian còn lại
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.post(`${path}/resume`, ...A, validateParams(channelParamsSchema), read, commandLimit, validateBody(commandSchema), controller.resume);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/skip:
 *   post:
 *     summary: Bỏ qua giai đoạn (chủ phiên) — bỏ qua FOCUS KHÔNG tính vòng hoàn thành
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.post(`${path}/skip`, ...A, validateParams(channelParamsSchema), read, commandLimit, validateBody(commandSchema), controller.skip);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/end:
 *   post:
 *     summary: Kết thúc phiên — chủ phiên, hoặc người có `manage` kênh (kết thúc khẩn cấp)
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.post(`${path}/end`, ...A, validateParams(channelParamsSchema), read, commandLimit, validateBody(commandSchema), controller.end);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/goal:
 *   put:
 *     summary: Đặt mục tiêu cá nhân (≤ 200 ký tự) — riêng tư hoặc chia sẻ với phòng; chưa vào phòng → 409 CALL_POMO_006
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.put(`${path}/goal`, ...A, validateParams(channelParamsSchema), read, scopeLimiter("pomodoro-goal", byUserAndChannel, [{ max: 20, windowSeconds: 60 }]), validateBody(goalSchema), controller.setGoal);

/**
 * @openapi
 * /channels/{channelId}/pomodoro/sessions/{sessionId}/summary:
 *   get:
 *     summary: Kết quả phiên (bottom sheet cuối phiên) — vòng hoàn thành của phiên + thời gian có mặt/vòng có mặt/gián đoạn của RIÊNG người xem
 *     description: Nhật ký cá nhân, không dùng để chấm điểm hay tính đóng góp.
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.get(`${path}/sessions/:sessionId/summary`, ...A, validateParams(sessionParamsSchema), read, controller.summary);

/**
 * @openapi
 * /me/pomodoro/history:
 *   get:
 *     summary: Lịch sử Pomodoro cá nhân (mới → cũ, cursor) — presence của tôi + tóm tắt phiên
 *     tags: [Pomodoro]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/pomodoro/history", ...A, validateQuery(historyQuerySchema), controller.history);

export default router;
