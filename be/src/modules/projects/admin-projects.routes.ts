import { Router } from "express";
import type { Request, Response } from "express";
import { authenticateToken, requireFeature, requirePermission, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createReviewAdminController } from "./controllers/review-admin.controller";
import { reviewStatsQuerySchema } from "./dtos";
import { createProjectsContainer } from "./projects.container";

const { statsService, review } = createProjectsContainer();
const reviewAdmin = createReviewAdminController(review.stats);
const router = Router();

/**
 * @openapi
 * /admin/workspaces/{id}/project-stats:
 *   get:
 *     summary: Số liệu dự án của nhóm cho admin (bảng, thẻ theo loại cột, quá hạn, hoàn thành 30 ngày/8 tuần)
 *     description: "Chỉ SỐ LIỆU + tên bảng — không có tiêu đề/mô tả thẻ. Quyền `workspace:view`."
 *     tags: [Admin/Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/admin/workspaces/:id/project-stats",
  authenticateToken,
  requireFeature(MODULES.PROJECT),
  requirePermission("workspace:view"),
  validateParams(idParamSchema),
  catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await statsService.get(req.params.id));
  })
);

/**
 * @openapi
 * /admin/workspaces/{id}/review-stats:
 *   get:
 *     summary: "(p4-05) Số liệu chấm chéo của nhóm cho admin: lượt đang mở, lượt chờ quá 72 giờ, thời gian chấm trung vị, tự duyệt/miễn chấm, số lượt mở theo bảng"
 *     description: "`?days=30` (1–180). CHỈ SỐ ĐẾM + tên bảng — không tên người chấm, điểm, nhận xét, tiêu đề thẻ. Quyền `workspace:view`. Thêm `roundsInPeriod` (mẫu số tỉ lệ tự duyệt)."
 *     tags: [Admin/Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/admin/workspaces/:id/review-stats",
  authenticateToken,
  requireFeature(MODULES.PROJECT),
  requirePermission("workspace:view"),
  validateParams(idParamSchema),
  validateQuery(reviewStatsQuerySchema),
  reviewAdmin.get
);

export default router;
