import { Router } from "express";
import { authenticateToken, requireFeature, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema, reasonSchema } from "../../shared/dto/common-schemas";
import { createStudySetAdminController } from "./controllers/study-set-admin.controller";
import { adminItemsQuerySchema, adminReportedSetsQuerySchema } from "./dtos";
import { getStudyContainer } from "./study.container";

/**
 * Admin bộ học (admin.md p4-01 §3) — mount ở root v1 (path tuyệt đối `/admin/study-sets/*`). Chỉ xem NỘI DUNG bộ PUBLIC; bộ WORKSPACE chỉ
 * metadata, bộ PRIVATE/đã xoá → 404. Ẩn/khôi phục bắt buộc `reason` (10–500), ghi audit `study-set.hide|restore` và (khi ẩn) đóng báo cáo mở.
 */
const router = Router();
const container = getStudyContainer();
const controller = createStudySetAdminController(container.moderation, container.adminOverview);

const guard = [authenticateToken, requireFeature(MODULES.STUDY)];
const id = validateParams(idParamSchema);

/**
 * @openapi
 * /admin/study-sets:
 *   get:
 *     summary: "Tab content của admin: bộ PUBLIC có ≥ minReports báo cáo mở (mặc định 5), sắp reportedCount giảm dần; lọc status ACTIVE|HIDDEN, page/limit ≤ 50"
 *     tags: [Admin/Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: AdminStudySetDto[], meta: { page, limit, total, totalPages, hasNext, hasPrev }" }
 */
router.get("/admin/study-sets", ...guard, requirePermission("moderation:view"), validateQuery(adminReportedSetsQuerySchema), controller.listReported);

/**
 * @openapi
 * /admin/users/{id}/study-summary:
 *   get:
 *     summary: "Tab Học tập của user drawer: số bộ học của người dùng (total, public, workspace, private, hidden) — chỉ số liệu, không tiêu đề/nội dung. 404 nếu không có người dùng"
 *     tags: [Admin/Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ userId, total, public, workspace, private, hidden }" }
 */
router.get("/admin/users/:id/study-summary", ...guard, requirePermission("moderation:view"), id, controller.userSummary);

/**
 * @openapi
 * /admin/study-sets/{id}:
 *   get:
 *     summary: Ngữ cảnh bộ học cho hàng đợi kiểm duyệt (metadata + reportedCount + canViewContent)
 *     tags: [Admin/Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: AdminStudySetDto }
 */
router.get("/admin/study-sets/:id", ...guard, requirePermission("moderation:view"), id, controller.get);

/**
 * @openapi
 * /admin/study-sets/{id}/items:
 *   get:
 *     summary: Nội dung mục của bộ PUBLIC (page/limit ≤ 50) — bộ WORKSPACE trả 403, PRIVATE 404
 *     tags: [Admin/Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: StudyItemDto[], meta: { page, limit, total, totalPages, hasNext, hasPrev }" }
 */
router.get("/admin/study-sets/:id/items", ...guard, requirePermission("moderation:view"), id, validateQuery(adminItemsQuerySchema), controller.items);

/**
 * @openapi
 * /admin/study-sets/{id}/hide:
 *   post:
 *     summary: Ẩn bộ PUBLIC vi phạm (moderation:update) — audit study-set.hide, đóng báo cáo mở (CONTENT_REMOVED)
 *     tags: [Admin/Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: AdminStudySetDto }
 */
router.post("/admin/study-sets/:id/hide", ...guard, requirePermission("moderation:update"), id, validateBody(reasonSchema), controller.hide);

/**
 * @openapi
 * /admin/study-sets/{id}/restore:
 *   post:
 *     summary: Khôi phục bộ PUBLIC đã ẩn (moderation:update) — audit study-set.restore
 *     tags: [Admin/Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: AdminStudySetDto }
 */
router.post("/admin/study-sets/:id/restore", ...guard, requirePermission("moderation:update"), id, validateBody(reasonSchema), controller.restore);

export default router;
