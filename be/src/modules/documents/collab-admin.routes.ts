import { Router } from "express";
import { z } from "zod";
import { apiLimiter, authenticateToken, requirePermission, validateBody, validateQuery } from "../../core/middlewares";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { reasonSchema } from "../../shared/dto/common-schemas";
import { getDocumentsContainer } from "./documents.container";
import { CollabAdminService } from "./services/collab-admin.service";

const c = getDocumentsContainer();
const admin = new CollabAdminService({ documents: c.documents, snapshots: c.snapshots, directory: c.directory, cron: c.cron, audit: c.audit });

const largeQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

const router = Router();
// Không gắn cờ `collab`: vận hành cần thấy service chạy/không TRƯỚC khi bật phân hệ. Quyền theo vai hệ thống; KHÔNG có endpoint đọc nội dung tài liệu.
const A = [authenticateToken, apiLimiter] as const;

/**
 * @openapi
 * /admin/collab/health:
 *   get: { summary: "Sức khoẻ service collab (GET /health nội bộ, timeout 3 giây): status ok | degraded | down | disabled", tags: [Admin Collab], security: [{ BearerAuth: [] }] }
 * /admin/collab/stats:
 *   get: { summary: "Số liệu tức thời: kết nối/tài liệu đang mở, state chưa lưu (từ collab)", tags: [Admin Collab], security: [{ BearerAuth: [] }] }
 * /admin/collab/documents/large:
 *   get: { summary: "Top tài liệu theo dung lượng state — CHỈ metadata (tiêu đề ẩn với tài liệu PRIVATE)", tags: [Admin Collab], security: [{ BearerAuth: [] }] }
 * /admin/collab/cleanup-snapshots:
 *   post: { summary: "Dọn bản lưu AUTO vượt trần ở mọi tài liệu ({ reason } ≥ 10 ký tự, audit collab.cleanup-snapshots)", tags: [Admin Collab], security: [{ BearerAuth: [] }] }
 */
const health = catchAsync(async (_req, res) => {
  ResponseUtils.success(res, await admin.health());
});
const stats = catchAsync(async (_req, res) => {
  ResponseUtils.success(res, await admin.stats());
});
const largeDocuments = catchAsync(async (req, res) => {
  ResponseUtils.success(res, await admin.largeDocuments((req.query as unknown as { limit: number }).limit));
});
const cleanupSnapshots = catchAsync(async (req, res) => {
  ResponseUtils.success(res, await admin.cleanupSnapshots(req.user!, (req.body as { reason: string }).reason), "Đã dọn bản lưu tự động");
});

router.get("/admin/collab/health", ...A, requirePermission("integration:view"), health);
router.get("/admin/collab/stats", ...A, requirePermission("integration:view"), stats);
router.get("/admin/collab/documents/large", ...A, requirePermission("integration:view"), validateQuery(largeQuerySchema), largeDocuments);
router.post("/admin/collab/cleanup-snapshots", ...A, requirePermission("system-config:update"), validateBody(reasonSchema), cleanupSnapshots);

export default router;
