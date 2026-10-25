import { Router } from "express";
import type { Request } from "express";
import { apiLimiter, authenticateToken, requireFeature, scopeLimiter, validateBody, validateParams } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { createMeetingHostController } from "./controllers/meeting-host.controller";
import { createMeetingLobbyController } from "./controllers/meeting-lobby.controller";
import { createMeetingRoomController } from "./controllers/meeting-room.controller";
import {
  endMeetingSchema,
  joinMeetingSchema,
  leaveMeetingSchema,
  meetingIdParamSchema,
  muteAllSchema,
  muteParticipantSchema,
  participantRoleSchema,
  removeParticipantSchema,
  roomUserParamsSchema,
  startMeetingSchema,
  transferControlSchema,
} from "./dtos";
import { getMeetingsContainer } from "./meetings.container";
import { requireMeeting } from "./middlewares/meeting-guards";

/** Container dựng lười lúc có request đầu tiên (test thay container bằng `setMeetingsContainerForTests` TRƯỚC request) — cùng cách `meetings.routes.ts`. */
const lazyContainer = new Proxy({} as ReturnType<typeof getMeetingsContainer>, {
  get: (_t, key) => (getMeetingsContainer() as unknown as Record<PropertyKey, unknown>)[key],
});
const room = createMeetingRoomController(lazyContainer);
const lobby = createMeetingLobbyController(lazyContainer);
const host = createMeetingHostController(lazyContainer);

// `A` = authenticateToken → cờ `meeting` (404 CFG_005 khi tắt) → apiLimiter (be.md §4).
const A = [authenticateToken, requireFeature(MODULES.MEETING), apiLimiter] as const;
const byUser = (req: Request): string | null => req.user?.id ?? null;
const P = validateParams(meetingIdParamSchema);
/** Quyền cơ bản để đứng trong phòng (người được mời hoặc thành viên workspace của cuộc họp `WORKSPACE`); vai chủ trì kiểm ở service (lịch ⊕ phiên). */
const inRoom = requireMeeting("meeting.join");
const hostLimit = scopeLimiter("meeting-host", byUser, [{ max: LIMITS.meeting.hostActionPerMinute, windowSeconds: 60 }]);

const router = Router();

/**
 * @openapi
 * /meetings/{meetingId}/start:
 *   post:
 *     summary: Bắt đầu / bắt đầu lại cuộc họp (chủ trì, đồng chủ trì) — trả JoinResultDto (JOINED) kèm chi tiết cuộc họp. Chưa tới cửa sổ vào phòng → MEET_012.
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/join:
 *   post:
 *     summary: Vào phòng họp — 200 JoinResultDto oneOf theo `state` (WAITING_FOR_HOST | IN_LOBBY | JOINED). Lỗi nghiệp vụ MEET_006/007/009/010/012/013/017/018, CALL_004.
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/room:
 *   get:
 *     summary: Ảnh chụp phòng (vai trò, khoá, giờ tự đóng, người tham gia, số người chờ) — đồng bộ sau khi vào/reconnect
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/leave:
 *   post:
 *     summary: Rời phòng (idempotent), tuỳ chọn giao quyền `transferControlTo` (→ CO_HOST phiên)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/end:
 *   post:
 *     summary: Kết thúc cho mọi người (chủ trì/đồng chủ trì, idempotent)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/chat-group:
 *   post:
 *     summary: Tạo/lấy nhóm chat của cuộc họp (chủ trì/đồng chủ trì) — dùng lại đồng bộ nhóm chat p2-04
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/meetings/:meetingId/start", ...A, P, requireMeeting("meeting.start"), scopeLimiter("meeting-start", byUser, [{ max: LIMITS.meeting.startPerMinute, windowSeconds: 60 }]), validateBody(startMeetingSchema), room.start);
router.post("/meetings/:meetingId/join", ...A, P, inRoom, scopeLimiter("meeting-join", byUser, [{ max: LIMITS.meeting.joinPerMinute, windowSeconds: 60 }]), validateBody(joinMeetingSchema), room.join);
router.get("/meetings/:meetingId/room", ...A, P, inRoom, room.snapshot);
router.post("/meetings/:meetingId/leave", ...A, P, requireMeeting("meeting.read"), validateBody(leaveMeetingSchema), room.leave);
router.post("/meetings/:meetingId/end", ...A, P, inRoom, hostLimit, validateBody(endMeetingSchema), room.end);
router.post("/meetings/:meetingId/chat-group", ...A, P, inRoom, hostLimit, room.chatGroup);

/**
 * @openapi
 * /meetings/{meetingId}/lobby:
 *   get:
 *     summary: Danh sách người đang chờ vào phòng (chủ trì/đồng chủ trì)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/lobby/me:
 *   delete:
 *     summary: Tự huỷ yêu cầu xin vào phòng (idempotent)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/lobby/{userId}/admit:
 *   post:
 *     summary: 'Cho vào — `{ admitted: false }` khi đã được xử lý (hai chủ trì cùng bấm chỉ MỘT lần thành công)'
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/lobby/{userId}/deny:
 *   post:
 *     summary: Từ chối — chặn xin vào lại 10 phút
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/lobby/admit-all:
 *   post:
 *     summary: Cho tất cả vào
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/meetings/:meetingId/lobby", ...A, P, inRoom, lobby.list);
router.delete("/meetings/:meetingId/lobby/me", ...A, P, requireMeeting("meeting.read"), lobby.cancelMine);
router.post("/meetings/:meetingId/lobby/admit-all", ...A, P, inRoom, hostLimit, lobby.admitAll);
router.post("/meetings/:meetingId/lobby/:userId/admit", ...A, validateParams(roomUserParamsSchema), inRoom, hostLimit, lobby.admit);
router.post("/meetings/:meetingId/lobby/:userId/deny", ...A, validateParams(roomUserParamsSchema), inRoom, hostLimit, lobby.deny);

/**
 * @openapi
 * /meetings/{meetingId}/lock:
 *   post:
 *     summary: Khoá phòng — người mới (chưa từng vào phiên này) nhận MEET_007; người rớt mạng vào lại được trong 5 phút. `/unlock` mở khoá.
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/participants/{userId}/mute:
 *   post:
 *     summary: Tắt mic/camera/dừng chia sẻ của một người ở server (KHÔNG có "bật lại" — người đó tự bật)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/participants/mute-all:
 *   post:
 *     summary: Tắt mic tất cả (trừ chủ trì/đồng chủ trì và người bấm)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/participants/{userId}/remove:
 *   post:
 *     summary: Mời ra khỏi phòng + chặn vào lại suốt phiên (MEET_013); tuỳ chọn xoá khỏi danh sách tham dự
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/participants/{userId}/role:
 *   post:
 *     summary: Cấp/thu CO_HOST trong phiên (chỉ chủ trì)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/hands/lower-all:
 *   post:
 *     summary: Hạ tay mọi người
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/hands/{userId}/lower:
 *   post:
 *     summary: Hạ tay MỘT người (chủ trì/đồng chủ trì) — xoá attribute handRaisedAt + call:host-action HAND_LOWERED chỉ tới người đó; 404 MEET_020 khi người đó không còn trong phòng
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/transfer-control:
 *   post:
 *     summary: Giao quyền điều khiển (người nhận thành CO_HOST phiên, người giao giữ vai)
 *     tags: [Meeting room]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/meetings/:meetingId/lock", ...A, P, inRoom, hostLimit, host.lock);
router.post("/meetings/:meetingId/unlock", ...A, P, inRoom, hostLimit, host.unlock);
router.post("/meetings/:meetingId/participants/mute-all", ...A, P, inRoom, hostLimit, validateBody(muteAllSchema), host.muteAll);
router.post("/meetings/:meetingId/participants/:userId/mute", ...A, validateParams(roomUserParamsSchema), inRoom, hostLimit, validateBody(muteParticipantSchema), host.mute);
router.post("/meetings/:meetingId/participants/:userId/remove", ...A, validateParams(roomUserParamsSchema), inRoom, hostLimit, validateBody(removeParticipantSchema), host.remove);
router.post("/meetings/:meetingId/participants/:userId/role", ...A, validateParams(roomUserParamsSchema), inRoom, hostLimit, validateBody(participantRoleSchema), host.setRole);
router.post("/meetings/:meetingId/hands/lower-all", ...A, P, inRoom, hostLimit, host.lowerAllHands);
router.post("/meetings/:meetingId/hands/:userId/lower", ...A, validateParams(roomUserParamsSchema), inRoom, hostLimit, host.lowerHand);
router.post("/meetings/:meetingId/transfer-control", ...A, P, inRoom, hostLimit, validateBody(transferControlSchema), host.transferControl);

export default router;
