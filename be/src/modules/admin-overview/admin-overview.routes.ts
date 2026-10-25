import { Router } from "express";
import { authenticateToken, requirePermission, validateQuery } from "../../core/middlewares";
import { createAdminOverviewController } from "./admin-overview.controller";
import { insightsQuerySchema, overviewQuerySchema } from "./admin-overview.validators";

const router = Router();
const controller = createAdminOverviewController();

router.use(authenticateToken);

/**
 * @openapi
 * /admin/overview:
 *   get:
 *     summary: "KPI tổng quan cho dashboard admin (người dùng mới, workspace hoạt động 7 ngày, báo cáo đang mở, job AI; media và liveQuizActive chỉ có khi cờ tương ứng bật)"
 *     tags: [AdminOverview]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/",
  requirePermission("dashboard:view"),
  validateQuery(overviewQuerySchema),
  controller.get
);

/**
 * @openapi
 * /admin/overview/insights:
 *   get:
 *     summary: "Số liệu phân tích cho trang Tổng quan: KPI + chuỗi theo ngày kèm kỳ liền trước (cùng số ngày), phân bổ, bản đồ nhiệt thứ×giờ, top workspace. ?range=7d|30d|90d (mặc định 30d; sai → 400). Khối theo cờ phân hệ (communication / voice|meeting / gamification) vắng khi cờ tắt. Chỉ số đếm, không danh tính; cache ~60 giây"
 *     tags: [AdminOverview]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: range, required: false, schema: { type: string, enum: ["7d", "30d", "90d"], default: "30d" } }
 */
router.get(
  "/insights",
  requirePermission("dashboard:view"),
  validateQuery(insightsQuerySchema),
  controller.insights
);

export default router;
