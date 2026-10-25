import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { env } from "../../core/config";
import { isProductionDeployment } from "../../core/config/deployment-env";
import { NotFoundError } from "../../core/exceptions";
import { authenticateToken, requirePermission } from "../../core/middlewares";
import { catchAsync } from "../../core/utils/catchAsync";

/**
 * Công cụ dev/staging (p0-11 be.md §4) — MODULE PHẲNG, chỉ một endpoint: `POST /api/v1/dev/sentry-test` ném lỗi thử để kiểm kênh báo lỗi (OPS-01):
 * sự kiện trên Sentry phải có `requestId`, không có header auth/cookie. Mount có điều kiện ở `router.ts` (cùng lớp kiểm 404 bên trong, như `media-dev`).
 *
 * Bật khi `DEV_TOOLS_ENABLED=true` VÀ không phải production thật (`isProductionDeployment`: NODE_ENV=production + SENTRY_ENVIRONMENT=production).
 * `validate-runtime` từ chối khởi động nếu bật ở production.
 */
export function isDevToolsEnabled(): boolean {
  return env.DEV_TOOLS_ENABLED && !isProductionDeployment();
}

/** Chạy TRƯỚC xác thực: endpoint tắt trả 404 như chưa từng tồn tại, kể cả khi router bị mount nhầm. */
export function requireDevToolsEnabled(_req: Request, _res: Response, next: NextFunction): void {
  next(isDevToolsEnabled() ? undefined : new NotFoundError());
}

/** `auth` nhận middleware xác thực/phân quyền — mặc định `authenticateToken` → `system-config:update`; test truyền bản giả. */
export function createDevToolsRouter(
  auth: RequestHandler[] = [authenticateToken, requirePermission("system-config:update")]
): Router {
  const router = Router();
  router.use(requireDevToolsEnabled);

  /**
   * @openapi
   * /dev/sentry-test:
   *   post:
   *     summary: "[dev/staging] Ném lỗi thử để kiểm kênh báo lỗi Sentry (chỉ khi DEV_TOOLS_ENABLED=true, không ở production)"
   *     tags: [Admin — Media]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       500: { description: "Luôn 500 SYS_500 — sự kiện tương ứng xuất hiện trên Sentry" }
   *       403: { description: "Thiếu quyền system-config:update" }
   *       404: { description: "Endpoint tắt" }
   */
  router.post(
    "/",
    ...auth,
    catchAsync(() => {
      throw new Error("sentry-test: lỗi thử của p0-11 OPS-01 — có thể bỏ qua sự kiện này");
    })
  );

  return router;
}

export default createDevToolsRouter();
