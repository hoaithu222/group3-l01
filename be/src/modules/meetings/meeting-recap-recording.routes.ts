import { Router } from "express";
import type { Request } from "express";
import { apiLimiter, authenticateToken, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { createMeetingRecapController } from "./controllers/meeting-recap.controller";
import { createMeetingRecordingController } from "./controllers/meeting-recording.controller";
import {
  attachRecapAssetSchema,
  consentRequestSchema,
  consentResponseSchema,
  deleteRecordingQuerySchema,
  meetingIdParamSchema,
  publishRecapSchema,
  recapAttachmentParamsSchema,
  recordingIdParamSchema,
  recordingUrlQuerySchema,
  startRecordingSchema,
  upsertRecapSchema,
} from "./dtos";
import { getMeetingsContainer } from "./meetings.container";
import { requireMeeting, validateMeetingBody } from "./middlewares/meeting-guards";

/** Container dựng lười lúc có request đầu tiên (test thay container bằng `setMeetingsContainerForTests` TRƯỚC request) — cùng cách `meetings.routes.ts`. */
const lazyContainer = new Proxy({} as ReturnType<typeof getMeetingsContainer>, {
  get: (_t, key) => (getMeetingsContainer() as unknown as Record<PropertyKey, unknown>)[key],
});
const recap = createMeetingRecapController(lazyContainer);
const rec = createMeetingRecordingController(lazyContainer);

// `A` = authenticateToken → cờ `meeting` (404 CFG_005 khi tắt) → apiLimiter (be.md §4).
const A = [authenticateToken, requireFeature(MODULES.MEETING), apiLimiter] as const;
const byUser = (req: Request): string | null => req.user?.id ?? null;
const byMeeting = (req: Request): string | null => req.params.meetingId ?? null;
const P = validateParams(meetingIdParamSchema);
const RP = validateParams(recordingIdParamSchema);
/** Thấy được cuộc họp (kể cả chỉ metadata) — quyền sửa/công bố/điều khiển do SERVICE quyết định (vai lịch ⊕ vai phiên ⊕ tác giả), không thể suy từ action của resolver. */
const visible = requireMeeting("meeting.read");

const router = Router();

/**
 * @openapi
 * /meetings/{meetingId}/recap:
 *   get:
 *     summary: Biên bản họp — người sửa thấy nháp (chưa có bản ghi → nháp rỗng version 0); người xem chỉ thấy bản đã công bố (chưa công bố → 404 MEET_001)
 *     tags: [Meeting recap]
 *     security: [{ BearerAuth: [] }]
 *   put:
 *     summary: Lưu nháp biên bản (chủ trì/đồng chủ trì/người tạo; cuộc họp LIVE hoặc ENDED). Lần đầu không cần expectedVersion; sau đó CAS — lệch → 409 RES_003
 *     tags: [Meeting recap]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/recap/publish:
 *   post:
 *     summary: Công bố biên bản (chủ trì/đồng chủ trì) — lần đầu đăng thẻ MEETING_RECAP + push; công bố lại sửa thẻ, không tạo tin mới
 *     tags: [Meeting recap]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/recap/attachments:
 *   post:
 *     summary: Đính kèm asset READY (scope MEETING) của chính mình — tối đa attachmentsMax (MEET_022)
 *     tags: [Meeting recap]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/recap/attachments/{assetId}:
 *   delete:
 *     summary: Gỡ tệp khỏi biên bản — trả RecapDto mới
 *     tags: [Meeting recap]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/meetings/:meetingId/recap", ...A, P, visible, recap.get);
router.put("/meetings/:meetingId/recap", ...A, P, visible, validateMeetingBody(upsertRecapSchema), recap.upsert);
router.post("/meetings/:meetingId/recap/publish", ...A, P, visible, validateBody(publishRecapSchema), recap.publish);
router.post("/meetings/:meetingId/recap/attachments", ...A, P, visible, validateBody(attachRecapAssetSchema), recap.attach);
router.delete("/meetings/:meetingId/recap/attachments/:assetId", ...A, validateParams(recapAttachmentParamsSchema), visible, recap.detach);

/**
 * @openapi
 * /meetings/{meetingId}/recordings/consent-request:
 *   post:
 *     summary: Chủ trì hỏi ý kiến cả phòng về việc ghi hình (hết hạn sau 120 s) — phát call:recording CONSENT_REQUESTED
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/recordings/consent:
 *   post:
 *     summary: Người trong phòng trả lời đồng ý/từ chối (requestId bỏ trống = người vào sau khi đang ghi → đồng ý mới được bật mic/camera)
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/recordings/consent-status:
 *   get:
 *     summary: Tiến độ đồng ý (chỉ số lượng, không tên) — chủ trì/đồng chủ trì
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 * /meetings/{meetingId}/recordings:
 *   post:
 *     summary: Bắt đầu ghi hình khi MỌI người trong phòng đã đồng ý (409 REC_001 kèm pendingCount) — một egress/phiên (409 REC_002)
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 *   get:
 *     summary: Danh sách bản ghi (người điều khiển thấy cả PROCESSING/FAILED, người xem chỉ READY)
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/meetings/:meetingId/recordings/consent-request",
  ...A,
  P,
  visible,
  scopeLimiter("rec-consent", byMeeting, [{ max: LIMITS.recording.consentRequestPerMinute, windowSeconds: 60 }]),
  validateBody(consentRequestSchema),
  rec.consentRequest
);
router.post("/meetings/:meetingId/recordings/consent", ...A, P, requireMeeting("meeting.join"), validateBody(consentResponseSchema), rec.consentRespond);
router.get("/meetings/:meetingId/recordings/consent-status", ...A, P, visible, rec.consentStatus);
router.post("/meetings/:meetingId/recordings", ...A, P, visible, validateBody(startRecordingSchema), rec.start);
router.get("/meetings/:meetingId/recordings", ...A, P, visible, rec.list);

/**
 * @openapi
 * /recordings/{recordingId}:
 *   get:
 *     summary: Chi tiết bản ghi (myActions do server tính)
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Xoá bản ghi — chủ trì theo lịch hoặc OWNER workspace (OWNER không chủ trì bắt buộc reason ≥ 10 ký tự); đang ghi → 409 MEET_009
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 * /recordings/{recordingId}/stop:
 *   post:
 *     summary: Dừng ghi hình (chủ trì/đồng chủ trì) — idempotent
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 * /recordings/{recordingId}/url:
 *   get:
 *     summary: URL ký để phát (STREAM, 900 s — ngoại lệ có chủ đích cho video dài) hoặc tải (DOWNLOAD, 60 s, chủ trì/đồng chủ trì/OWNER)
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 * /recordings/{recordingId}/retry-import:
 *   post:
 *     summary: Thử lại xử lý bản ghi FAILED khi egress đã ghi tệp (còn trên storage)
 *     tags: [Meeting recording]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/recordings/:recordingId", ...A, RP, rec.get);
router.delete("/recordings/:recordingId", ...A, RP, validateQuery(deleteRecordingQuerySchema), rec.remove);
router.post("/recordings/:recordingId/stop", ...A, RP, rec.stop);
router.get("/recordings/:recordingId/url", ...A, RP, validateQuery(recordingUrlQuerySchema), scopeLimiter("rec-url", byUser, [{ max: LIMITS.recording.urlPerMinute, windowSeconds: 60 }]), rec.url);
router.post("/recordings/:recordingId/retry-import", ...A, RP, rec.retryImport);

export default router;
