import { Router } from "express";
import { apiLimiter, authenticateToken, idempotencyKey, requireFeature, requireSystemConfig, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { FeatureDisabledError } from "../../core/exceptions";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { createPortfolioController } from "./controllers/portfolio.controller";
import { createPortfolioProjectsController } from "./controllers/portfolio-projects.controller";
import { addProjectSchema, changeSlugSchema, eligibleQuerySchema, previewQuerySchema, projectIdParamSchema, publishSchema, reorderProjectsSchema, slugAvailableQuerySchema, updatePortfolioSchema, updateProjectSchema, userIdParamSchema } from "./dtos";
import { getPortfolioContainer, type PortfolioContainer } from "./portfolio.container";
import { registerPortfolioModule } from "./index";

const byUser = (req: { user?: { id: string } }): string | null => req.user?.id ?? null;

/**
 * Router người dùng của p6-07 (path tuyệt đối, mount ở root v1). Cờ `career` và công tắc khẩn cấp `portfolio.enabled` (SystemConfig) — tắt cái nào cũng → 404 `CFG_005`. Ảnh (đại diện/bìa) tải lên bằng
 * `POST /assets` scope `AVATAR` rồi gửi `avatarAssetId`/`coverAssetId`. Trang công khai `/p/*` ở `public-portfolio.routes.ts` (ngoài `/api`), gỡ vi phạm ở `admin-portfolio.routes.ts`.
 */
export function createPortfolioRouter(c: PortfolioContainer = getPortfolioContainer()): Router {
  const ctl = createPortfolioController(c.portfolio, c.publish, c.preview);
  const projects = createPortfolioProjectsController(c.projectService);
  const guard = [authenticateToken, requireFeature(MODULES.CAREER), requireSystemConfig("portfolio.enabled", () => new FeatureDisabledError()), apiLimiter];
  const hourly = (max: number) => [{ max, windowSeconds: 3600 }];
  const router = Router();

  /**
   * @openapi
   * /me/portfolio:
   *   get:
   *     summary: "Hồ sơ portfolio của tôi kèm dự án, lần dựng trang gần nhất và link công khai (portfolio null khi chưa tạo)"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "{ portfolio | null, projects[], latestBuild | null, publicUrl | null }" }
   *   put:
   *     summary: "Ghi ĐỦ hồ sơ (tạo lười ở lần đầu với expectedVersion 0, slug tự sinh). 409 RES_003 lệch phiên bản"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/me/portfolio", ...guard, ctl.overview);
  router.put("/me/portfolio", ...guard, validateBody(updatePortfolioSchema), ctl.update);

  /**
   * @openapi
   * /portfolio/slug-available:
   *   get:
   *     summary: "Kiểm slug có dùng được không - 60 lượt/phút (reason TAKEN, INVALID, BANNED, RESERVED)"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/portfolio/slug-available", ...guard, scopeLimiter("portfolio-slug-check", byUser, [{ max: LIMITS.portfolio.slugCheckPerMinute, windowSeconds: 60 }]), validateQuery(slugAvailableQuerySchema), ctl.slugAvailable);

  /**
   * @openapi
   * /me/portfolio/slug:
   *   put:
   *     summary: "Đổi slug - slug cũ giữ 30 ngày để chuyển hướng 301. PORT_001 trùng, PORT_002 sai dạng, PORT_003 từ cấm hoặc dành riêng"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.put("/me/portfolio/slug", ...guard, validateBody(changeSlugSchema), ctl.changeSlug);

  /**
   * @openapi
   * /portfolio/templates:
   *   get:
   *     summary: "4 mẫu cố định × 6 màu nhấn (mã màu đã kiểm tương phản)"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/portfolio/templates", ...guard, ctl.templates);

  /**
   * @openapi
   * /me/portfolio/eligible-workspaces:
   *   get:
   *     summary: "Nhóm có thể thêm vào portfolio (có thẻ hoàn thành được tính, kể cả đã rời hoặc đã lưu trữ) - cursor"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/me/portfolio/eligible-workspaces", ...guard, validateQuery(eligibleQuerySchema), projects.eligible);

  /**
   * @openapi
   * /me/portfolio/projects:
   *   post:
   *     summary: "Thêm dự án từ nhóm và chụp số liệu - Idempotency-Key. PORT_004 chưa đủ điều kiện, PORT_005 quá 12 dự án, PORT_006 trùng"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/me/portfolio/projects", ...guard, idempotencyKey("portfolio-add-project"), validateBody(addProjectSchema), projects.add);

  /**
   * @openapi
   * /me/portfolio/projects/order:
   *   put:
   *     summary: "Sắp xếp lại dự án - projectIds phải đúng bằng tập hiện có, thiếu hoặc thừa trả 400 VAL_001"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.put("/me/portfolio/projects/order", ...guard, validateBody(reorderProjectsSchema), projects.reorder);

  /**
   * @openapi
   * /me/portfolio/projects/{projectId}:
   *   patch:
   *     summary: "Sửa dự án (CAS expectedVersion của dự án) - tiêu đề, tóm tắt, vai trò, thời gian, điểm nổi bật, ảnh bìa, ẩn hiện, hiện tên đồng đội"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   *   delete:
   *     summary: "Xoá dự án khỏi hồ sơ"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.patch("/me/portfolio/projects/:projectId", ...guard, validateParams(projectIdParamSchema), validateBody(updateProjectSchema), projects.update);
  router.delete("/me/portfolio/projects/:projectId", ...guard, validateParams(projectIdParamSchema), projects.remove);

  /**
   * @openapi
   * /me/portfolio/projects/{projectId}/refresh:
   *   post:
   *     summary: "Làm mới số liệu dự án - 10 lượt/giờ, quá hạn mức trả 429 PORT_007 kèm retryAfterSeconds"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/me/portfolio/projects/:projectId/refresh", ...guard, scopeLimiter("portfolio-refresh", byUser, hourly(LIMITS.portfolio.refreshPerHour), ErrorCode.PORT_007), validateParams(projectIdParamSchema), projects.refresh);

  /**
   * @openapi
   * /me/portfolio/preview:
   *   get:
   *     summary: "HTML xem trước bản nháp (text/html, no-store, noindex) - tuỳ chọn thử mẫu và màu bằng template, accent. 404 khi chưa có hồ sơ"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/me/portfolio/preview", ...guard, validateQuery(previewQuerySchema), ctl.previewPage);

  /**
   * @openapi
   * /me/portfolio/publish:
   *   post:
   *     summary: "Công khai hoặc cập nhật trang - 202 với buildId, buildVersion; dựng nền, tiến độ qua socket portfolio:build-updated. 20 lượt/giờ. PORT_008 bị gỡ, PORT_009 đang dựng, PORT_010 chưa có nội dung"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/me/portfolio/publish", ...guard, scopeLimiter("portfolio-publish", byUser, hourly(LIMITS.portfolio.publishPerHour)), validateBody(publishSchema), ctl.publishNow);

  /**
   * @openapi
   * /me/portfolio/unpublish:
   *   post:
   *     summary: "Ngừng công khai - trang 404 ngay ở BE, có thể còn hiển thị tối đa 5 phút qua nginx. PORT_011 chưa công khai"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/me/portfolio/unpublish", ...guard, ctl.unpublish);

  /**
   * @openapi
   * /me/portfolio/builds/latest:
   *   get:
   *     summary: "Lần dựng trang gần nhất (data null khi chưa có) - app poll khi socket mất"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/me/portfolio/builds/latest", ...guard, ctl.latestBuild);

  /**
   * @openapi
   * /users/{userId}/portfolio-link:
   *   get:
   *     summary: "Link portfolio của người khác khi đang công khai, kèm portfolioId để báo cáo - ngược lại 404"
   *     tags: [Portfolio]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/users/:userId/portfolio-link", ...guard, validateParams(userIdParamSchema), ctl.link);

  return router;
}

const router = createPortfolioRouter();

// Loại thông báo `portfolio.*` + đích báo cáo `PORTFOLIO` (side-effect lúc import, như `career.routes.ts`; worker đăng ký ở `jobs/portfolio.jobs.ts`).
registerPortfolioModule();

export default router;
