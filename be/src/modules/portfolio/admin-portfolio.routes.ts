import { Router } from "express";
import { authenticateToken, requirePermission, validateBody, validateParams } from "../../core/middlewares";
import { createAdminPortfolioController } from "./controllers/admin-portfolio.controller";
import { portfolioIdParamSchema, restoreSchema, takedownSchema } from "./dtos";
import { getPortfolioContainer, type PortfolioContainer } from "./portfolio.container";

/**
 * Vận hành gỡ vi phạm portfolio (path tuyệt đối, mount ở root v1). `moderation:view` xem, `moderation:update` gỡ/mở lại (lý do bắt buộc + audit `portfolio.takedown|restore`).
 * KHÔNG gắn cờ tính năng: vận hành phải gỡ được kể cả khi `career`/`portfolio.enabled` đang tắt (trang công khai đã 404 nhưng dữ liệu vẫn cần xử lý).
 */
export function createAdminPortfolioRouter(c: PortfolioContainer = getPortfolioContainer()): Router {
  const ctl = createAdminPortfolioController(c.publish);
  const byId = validateParams(portfolioIdParamSchema);
  const router = Router();

  /**
   * @openapi
   * /admin/portfolios/{portfolioId}:
   *   get:
   *     summary: "Metadata portfolio cho drawer báo cáo (id, chủ, slug, trạng thái, link, thông tin gỡ) - không nội dung hồ sơ"
   *     tags: [Admin-Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/admin/portfolios/:portfolioId", authenticateToken, requirePermission("moderation:view"), byId, ctl.get);

  /**
   * @openapi
   * /admin/portfolios/{portfolioId}/takedown:
   *   post:
   *     summary: "Gỡ portfolio vi phạm - trang 404 ngay, thông báo chủ, đóng báo cáo mở, ghi audit. Body reason 10-500 ký tự, reportGroupKey tuỳ chọn. Idempotent"
   *     tags: [Admin-Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/admin/portfolios/:portfolioId/takedown", authenticateToken, requirePermission("moderation:update"), byId, validateBody(takedownSchema), ctl.takedown);

  /**
   * @openapi
   * /admin/portfolios/{portfolioId}/restore:
   *   post:
   *     summary: "Mở lại portfolio đã gỡ (không tự công khai lại). PORT_012 khi hồ sơ không bị gỡ"
   *     tags: [Admin-Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/admin/portfolios/:portfolioId/restore", authenticateToken, requirePermission("moderation:update"), byId, validateBody(restoreSchema), ctl.restore);

  return router;
}

export default createAdminPortfolioRouter();
