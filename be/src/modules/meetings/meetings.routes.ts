import { Router } from "express";
import type { Request } from "express";
import {
  apiLimiter,
  authenticateToken,
  idempotencyKey,
  requireFeature,
  scopeLimiter,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { requireWorkspaceRole } from "../../core/permission";
import { createMeetingsController } from "./controllers/meetings.controller";
import recapRecordingRoutes from "./meeting-recap-recording.routes";
import roomRoutes from "./meeting-room.routes";
import { getMeetingsContainer } from "./meetings.container";
import { requireMeeting, validateMeetingBody } from "./middlewares/meeting-guards";
import {
  addAttendeesSchema,
  attendeeParamSchema,
  attendeesQuerySchema,
  cancelMeetingSchema,
  createMeetingSchema,
  deleteMeetingQuerySchema,
  meetingIdParamSchema,
  meetingRangeQuerySchema,
  resolveParamsSchema,
  rsvpSchema,
  setAttendeeRoleSchema,
  transferHostSchema,
  updateMeetingSchema,
  workspaceIdParamSchema,
} from "./dtos";

/** Container dựng lười lúc có request đầu tiên (test thay container bằng `setMeetingsContainerForTests` TRƯỚC request). */
const lazyContainer = new Proxy({} as ReturnType<typeof getMeetingsContainer>, {
  get: (_t, key) => (getMeetingsContainer() as unknown as Record<PropertyKey, unknown>)[key],
});
const controller = createMeetingsController(lazyContainer);

// `A` = authenticateToken → cờ `meeting` (404 CFG_005 khi tắt) → apiLimiter (be.md §4).
const A = [authenticateToken, requireFeature(MODULES.MEETING), apiLimiter] as const;
const byUser = (req: Request): string | null => req.user?.id ?? null;

const router = Router();

/**
 * @openapi
 * /workspaces/{workspaceId}/meetings:
 *   post:
 *     summary: Tạo cuộc họp trong workspace (bắt buộc header Idempotency-Key)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 *   get:
 *     summary: Lịch họp của workspace trong khoảng from..to (≤ 62 ngày, ≤ 500 mục) — ẩn cuộc họp ATTENDEES của người khác
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/meetings",
  ...A,
  validateParams(workspaceIdParamSchema),
  requireWorkspaceRole("MEMBER"),
  scopeLimiter("meeting-create", byUser, [{ max: LIMITS.meeting.createPerHour, windowSeconds: 3600 }]),
  idempotencyKey("meeting-create", { required: true }),
  validateMeetingBody(createMeetingSchema),
  controller.create
);
router.get("/workspaces/:workspaceId/meetings", ...A, validateParams(workspaceIdParamSchema), requireWorkspaceRole("MEMBER"), validateQuery(meetingRangeQuerySchema), controller.listWorkspace);

/**
 * @openapi
 * /me/meetings:
 *   get:
 *     summary: Lịch họp của tôi (scope=MINE|ALL_VISIBLE)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/meetings", ...A, validateQuery(meetingRangeQuerySchema), controller.listMine);

/**
 * @openapi
 * /meetings/resolve/{code}:
 *   get:
 *     summary: Mở từ link/mã họp — người không đủ quyền chỉ nhận allowed=false NOT_AVAILABLE (không lộ tiêu đề)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/meetings/resolve/:code", ...A, scopeLimiter("meeting-resolve", byUser, [{ max: LIMITS.meeting.resolvePerMinute, windowSeconds: 60 }]), validateParams(resolveParamsSchema), controller.resolve);

/**
 * @openapi
 * /meetings/{meetingId}:
 *   get:
 *     summary: Chi tiết cuộc họp kèm myActions (bản metadata cho OWNER/ADMIN không tham dự)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 *   patch:
 *     summary: Sửa cuộc họp theo trạng thái (SCHEDULED mọi trường; LIVE chỉ tiêu đề/agenda/endAt/lobby) — CAS expectedVersion
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Xoá mềm cuộc họp (SCHEDULED huỷ trước; ENDED có biên bản/ghi hình chỉ OWNER kèm lý do)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/meetings/:meetingId", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.read"), controller.getById);
router.patch("/meetings/:meetingId", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.edit"), validateMeetingBody(updateMeetingSchema), controller.update);
router.delete("/meetings/:meetingId", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.delete"), validateQuery(deleteMeetingQuerySchema), controller.remove);

/**
 * @openapi
 * /meetings/{meetingId}/cancel:
 *   post:
 *     summary: Huỷ cuộc họp SCHEDULED (OWNER/ADMIN không tham dự bắt buộc lý do + audit meeting.cancel-by-admin)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/meetings/:meetingId/cancel", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.cancel"), validateBody(cancelMeetingSchema), controller.cancel);

/**
 * @openapi
 * /meetings/{meetingId}/attendees:
 *   get:
 *     summary: Danh sách người tham dự (cursor) — chỉ người xem được chi tiết
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: Thêm người tham dự (SCHEDULED/LIVE, ≤ attendeesMax kiểm nguyên tử)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/meetings/:meetingId/attendees", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.detail.read"), validateQuery(attendeesQuerySchema), controller.listAttendees);
router.post(
  "/meetings/:meetingId/attendees",
  ...A,
  validateParams(meetingIdParamSchema),
  requireMeeting("meeting.invite"),
  scopeLimiter("meeting-invite", byUser, [{ max: LIMITS.meeting.invitePerHour, windowSeconds: 3600 }]),
  validateBody(addAttendeesSchema),
  controller.addAttendees
);

/**
 * @openapi
 * /meetings/{meetingId}/attendees/me:
 *   delete:
 *     summary: Tự rút khỏi danh sách tham dự (SCHEDULED; HOST phải chuyển chủ trì trước)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/attendees/{userId}:
 *   delete:
 *     summary: Xoá người tham dự (HOST/CO_HOST; CO_HOST không xoá được HOST/CO_HOST)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/meetings/:meetingId/attendees/me", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.read"), controller.leaveSelf);
router.delete("/meetings/:meetingId/attendees/:userId", ...A, validateParams(attendeeParamSchema), requireMeeting("meeting.attendee.remove"), controller.removeAttendee);

/**
 * @openapi
 * /meetings/{meetingId}/attendees/{userId}/role:
 *   put:
 *     summary: Cấp/thu CO_HOST (chỉ HOST)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/transfer-host:
 *   post:
 *     summary: Chuyển chủ trì (chỉ HOST) — CAS expectedVersion
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/rsvp:
 *   put:
 *     summary: Phản hồi tham dự (chỉ thông tin, không chặn vào phòng)
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/ics:
 *   get:
 *     summary: Tải .ics (METHOD:PUBLISH) để thêm vào lịch thiết bị
 *     tags: [Meetings]
 *     security: [{ BearerAuth: [] }]
 */
router.put("/meetings/:meetingId/attendees/:userId/role", ...A, validateParams(attendeeParamSchema), requireMeeting("meeting.role.manage"), validateBody(setAttendeeRoleSchema), controller.setRole);
router.post("/meetings/:meetingId/transfer-host", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.role.manage"), validateBody(transferHostSchema), controller.transferHost);
router.put("/meetings/:meetingId/rsvp", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.rsvp"), validateBody(rsvpSchema), controller.rsvp);
router.get("/meetings/:meetingId/ics", ...A, validateParams(meetingIdParamSchema), requireMeeting("meeting.detail.read"), controller.ics);

// (p2-05) Phòng họp: start/join/leave/end, phòng chờ, điều khiển chủ trì — cùng một router `/meetings/:meetingId/*`.
router.use(roomRoutes);
// (p2-06) Biên bản (`/meetings/:id/recap*`) và ghi hình (`/meetings/:id/recordings*`, `/recordings/:id*`).
router.use(recapRecordingRoutes);

export default router;
