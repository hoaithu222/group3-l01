import { Router } from "express";
import { authenticateToken, requireFeature, requirePermission, validateParams, validateQuery } from "../../core/middlewares";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { z } from "zod";
import { MODULES } from "../../core/constants/modules";
import { createAdminMeetingsController } from "./controllers/admin-meetings.controller";
import { createAdminRecordingsController } from "./controllers/admin-recordings.controller";
import { adminDeleteRecordingQuerySchema, adminRecordingListQuerySchema, adminWorkspaceMeetingsQuerySchema, recordingIdParamSchema, workspaceIdParamSchema } from "./dtos";
import { getMeetingsContainer } from "./meetings.container";
import { PrismaAdminMeetingReader } from "./repositories/admin-meeting.reader";
import { AdminMeetingQueryService } from "./services/admin-meeting-query.service";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const controller = createAdminMeetingsController(new AdminMeetingQueryService(new PrismaAdminMeetingReader()));

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/meetings:
 *   get:
 *     summary: Cuộc họp của workspace cho admin (CHỈ metadata — không agenda/địa điểm/link/mã họp/người tham dự); lọc status, khoảng startAt; startAt mới → cũ
 *     tags: [Admin/Meetings]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string }, description: "SCHEDULED|LIVE|ENDED|CANCELLED, phân tách bằng dấu phẩy" }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: "data: AdminMeetingRow[], meta: { page, limit, total, totalPages, hasNext, hasPrev }" }
 *       404: { description: "Không có workspace, hoặc cờ meeting đang tắt (CFG_005)" }
 */
router.get(
  "/admin/workspaces/:workspaceId/meetings",
  authenticateToken,
  requireFeature(MODULES.MEETING),
  requirePermission("workspace:view"),
  validateParams(workspaceIdParamSchema),
  validateQuery(adminWorkspaceMeetingsQuerySchema),
  controller.listByWorkspace
);

/**
 * Bản ghi hình cuộc họp cho admin (p2-06 admin.md, D-24) — CHỈ metadata vận hành (dung lượng, thời lượng, trạng thái, hạn lưu trữ, lỗi đã làm sạch); KHÔNG có
 * endpoint phát/tải/URL ký và KHÔNG lộ mã họp/người tham dự/tên người đồng ý. Quyền (p2-07): `meeting:view` xem, `meeting:delete` xoá (chỉ `admin` — `manager`
 * không có `meeting:delete`; trước p2-07 tạm dùng `workspace:view|delete`, hiệu lực vai trò không đổi). Xoá bắt buộc `reason` 10–500 ký tự + audit `recording.delete`.
 *
 * @openapi
 * /admin/recordings:
 *   get:
 *     summary: Danh sách bản ghi hình (phân trang; lọc status CSV, workspaceId, meetingId, from/to, expiringWithinDays, includeDeleted; sort startedAt|durationSec|fileSizeBytes|retentionExpiresAt)
 *     tags: [Admin/Meetings]
 *     security: [{ BearerAuth: [] }]
 * /admin/recordings/summary:
 *   get:
 *     summary: Thẻ tóm tắt — tổng dung lượng, so với 30 ngày trước, số READY, sắp hết hạn 7 ngày, lỗi 24 giờ (tuỳ chọn ?workspaceId=)
 *     tags: [Admin/Meetings]
 *     security: [{ BearerAuth: [] }]
 * /admin/recordings/{recordingId}:
 *   get:
 *     summary: Chi tiết metadata một bản ghi (khoá object che một phần, trạng thái object từ HEAD, số người đồng ý)
 *     tags: [Admin/Meetings]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Xoá bản ghi (bắt buộc ?reason= 10–500 ký tự) — không xoá được bản đang ghi (409 MEET_009); audit recording.delete
 *     tags: [Admin/Meetings]
 *     security: [{ BearerAuth: [] }]
 */
const recordings = createAdminRecordingsController(() => getMeetingsContainer().recapRecording.admin);
const summaryQuerySchema = z.object({ workspaceId: objectIdSchema.optional() });
const ADMIN = [authenticateToken, requireFeature(MODULES.MEETING)] as const;
router.get("/admin/recordings", ...ADMIN, requirePermission("meeting:view"), validateQuery(adminRecordingListQuerySchema), recordings.list);
router.get("/admin/recordings/summary", ...ADMIN, requirePermission("meeting:view"), validateQuery(summaryQuerySchema), recordings.summary);
router.get("/admin/recordings/:recordingId", ...ADMIN, requirePermission("meeting:view"), validateParams(recordingIdParamSchema), recordings.detail);
router.delete("/admin/recordings/:recordingId", ...ADMIN, requirePermission("meeting:delete"), validateParams(recordingIdParamSchema), validateQuery(adminDeleteRecordingQuerySchema), recordings.remove);

export default router;
