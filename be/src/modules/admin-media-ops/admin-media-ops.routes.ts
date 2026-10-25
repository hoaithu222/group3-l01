import { Router } from "express";
import { MODULES } from "../../core/constants/modules";
import { authenticateToken, requireFeature, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { registerAdminOverviewMediaProvider } from "../../shared/ports/admin-overview-media.port";
import { getAdminMediaOpsContainer } from "./admin-media-ops.container";
import { createAdminCallsController } from "./controllers/admin-calls.controller";
import { createAdminMediaHealthController } from "./controllers/admin-media-health.controller";
import { createAdminMeetingsController } from "./controllers/admin-meetings.controller";
import {
  adminCallListQuerySchema,
  adminMeetingListQuerySchema,
  callIdParamSchema,
  callStatsQuerySchema,
  forceEndSchema,
  meetingIdParamSchema,
  workspaceIdParamSchema,
  workspaceMediaStatsQuerySchema,
} from "./dtos";

const router = Router();

// ── DI wiring (container dựng lười — test thay bằng `setAdminMediaOpsContainerForTests`) ──────────────────────────────────────────
const c = getAdminMediaOpsContainer;
const meetings = createAdminMeetingsController(() => c().query, () => c().forceEnd);
const calls = createAdminCallsController(() => c().query, () => c().stats, () => c().forceEnd);
const health = createAdminMediaHealthController(() => c().health, () => c().stats);

// KPI cho `GET /admin/overview` qua cổng `shared/ports` (admin-overview không import module này); chỉ hiện khi cờ `meeting`/`voice` bật.
registerAdminOverviewMediaProvider({ get: () => c().overview.get() });

/**
 * Middleware gắn TỪNG route (không `router.use`): router này mount ở root v1 TRƯỚC `/admin/workspaces` (xem `router.ts`) vì `admin-workspaces.routes` có `router.use(requireFeature(COMMUNICATION))`
 * chặn mọi `/admin/workspaces/*` — nếu mount sau, `media-stats` sẽ 404 khi cờ `communication` tắt dù cờ `meeting` bật; `router.use` ở đây lại chặn nhầm request của module khác đi qua.
 */
const MEETING = [authenticateToken, requireFeature(MODULES.MEETING)] as const;
/** Nhánh `/admin/calls*` cần thêm cờ `voice` (README §7) — cờ tắt → 404 `CFG_005`. */
const CALLS = [authenticateToken, requireFeature(MODULES.MEETING), requireFeature(MODULES.VOICE)] as const;

/**
 * Vận hành gọi & họp TOÀN NỀN TẢNG (p2-07) — CHỈ metadata, không nội dung: cuộc họp KHÔNG trả agenda/địa điểm/link/người tham dự/biên bản; cuộc gọi 1-1 KHÔNG trả người tham gia/id hội thoại
 * và KHÔNG lọc được theo người (`userId` → 400). Quyền `meeting:view` xem, `meeting:update` kết thúc cưỡng bức (bắt buộc `reason` ≥ 10 ký tự + audit). Bản ghi hình: xem `admin-meetings.routes.ts`.
 *
 * @openapi
 * /admin/meetings:
 *   get:
 *     summary: Cuộc họp toàn nền tảng (phân trang; q tiêu đề/mã họp; workspaceId, status CSV, platform, from/to; sort -startAt|startAt|-attendeeCount)
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 * /admin/meetings/{meetingId}:
 *   get:
 *     summary: Chi tiết cuộc họp (phiên hiện tại, ≤ 20 phiên gần nhất, tổng bản ghi hình) — không agenda/địa điểm/link/người tham dự
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 * /admin/meetings/{meetingId}/force-end:
 *   post:
 *     summary: Kết thúc cưỡng bức cuộc họp đang LIVE (body { reason } 10–500 ký tự) — 202, xử lý qua outbox; 409 MEET_009 khi không LIVE
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/meetings", ...MEETING, requirePermission("meeting:view"), validateQuery(adminMeetingListQuerySchema), meetings.list);
router.get("/admin/meetings/:meetingId", ...MEETING, requirePermission("meeting:view"), validateParams(meetingIdParamSchema), meetings.detail);
router.post("/admin/meetings/:meetingId/force-end", ...MEETING, requirePermission("meeting:update"), validateParams(meetingIdParamSchema), validateBody(forceEndSchema), meetings.forceEnd);

/**
 * @openapi
 * /admin/calls:
 *   get:
 *     summary: Cuộc gọi toàn nền tảng (phân trang; workspaceId, meetingId, scopeType, mode, mediaKind, status CSV, endReason CSV, from/to; KHÔNG nhận userId/conversationId)
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 * /admin/calls/stats:
 *   get:
 *     summary: Thống kê cuộc gọi theo ngày (from, to ≤ 92 ngày, tz IANA, workspaceId?) — 400 ADMIN_MEDIA_001 khi khoảng/múi giờ không hợp lệ; cache 5 phút
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 * /admin/calls/{callId}:
 *   get:
 *     summary: Chi tiết cuộc gọi — chỉ số đếm người tham gia theo trạng thái, không userId; DIRECT không có scopeId/conversationId
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 * /admin/calls/{callId}/force-end:
 *   post:
 *     summary: Kết thúc cưỡng bức cuộc gọi (body { reason }) — 202; 410 CALL_005 đã kết thúc; 409 ADMIN_MEDIA_002 nếu là cuộc gọi của cuộc họp
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 */
// `/stats` PHẢI khai báo trước `/:callId` (param objectId sẽ từ chối "stats").
router.get("/admin/calls", ...CALLS, requirePermission("meeting:view"), validateQuery(adminCallListQuerySchema), calls.list);
router.get("/admin/calls/stats", ...CALLS, requirePermission("meeting:view"), validateQuery(callStatsQuerySchema), calls.stats);
router.get("/admin/calls/:callId", ...CALLS, requirePermission("meeting:view"), validateParams(callIdParamSchema), calls.detail);
router.post("/admin/calls/:callId/force-end", ...CALLS, requirePermission("meeting:update"), validateParams(callIdParamSchema), validateBody(forceEndSchema), calls.forceEnd);

/**
 * @openapi
 * /admin/media/health:
 *   get:
 *     summary: Sức khoẻ hạ tầng media (LiveKit, Egress, webhook, TURN, hàng đợi calls/media) — luôn 200, phần lỗi trong body; cache 15 giây
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 * /admin/workspaces/{workspaceId}/media-stats:
 *   get:
 *     summary: Số liệu gọi & họp của workspace trong ?days= (1–92, mặc định 30) — chỉ số lượng/thời lượng, không danh sách người/cuộc
 *     tags: [Admin/Gọi & họp]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/media/health", ...MEETING, requirePermission("meeting:view"), health.check);
router.get("/admin/workspaces/:workspaceId/media-stats", ...MEETING, requirePermission("meeting:view"), validateParams(workspaceIdParamSchema), validateQuery(workspaceMediaStatsQuerySchema), health.workspaceStats);

export default router;
