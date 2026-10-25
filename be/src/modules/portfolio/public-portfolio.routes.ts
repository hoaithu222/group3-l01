import { Router } from "express";
import { createPublicPortfolioController } from "./controllers/public-portfolio.controller";
import { getPortfolioContainer, type PortfolioContainer } from "./portfolio.container";

/**
 * Trang portfolio CÔNG KHAI — mount ở `app.ts` tại `/p` (NGOÀI `/api`, trước body parser như webhook; chỉ GET nên không cần parse thân). `globalLimiter` (app.ts) đã áp cho mọi route.
 * Không xác thực, không JSON envelope: HTML/ảnh trả thẳng với CSP + `X-Content-Type-Options` + `Referrer-Policy` + `X-Robots-Tag` (xem `portfolio-http.ts`). Mọi trường hợp "không
 * có trang" (không tồn tại, chưa công khai, đã gỡ, cờ tắt) đều là CÙNG một trang 404 trung tính. nginx cache 5 phút (`deploy/`).
 */
export function createPublicPortfolioRouter(c: PortfolioContainer = getPortfolioContainer()): Router {
  const ctl = createPublicPortfolioController(c.publicPages, c.baseUrl);
  const router = Router();

  /**
   * @openapi
   * /p/{slug}:
   *   get:
   *     summary: "Trang portfolio công khai (HTML tĩnh) - 200 khi đang công khai, 301 sang slug mới trong 30 ngày, 404 trung tính còn lại. Mount ngoài /api (không nằm trong servers của spec)"
   *     tags: [Public-Portfolio]
   *     security: []
   */
  router.get("/:slug", ctl.page);

  /**
   * @openapi
   * /p/{slug}/assets/{file}:
   *   get:
   *     summary: "Ảnh đã resize của trang (file khớp img-xxxxxxxx.webp) - Cache-Control 5 phút"
   *     tags: [Public-Portfolio]
   *     security: []
   */
  router.get("/:slug/assets/:file", ctl.asset);

  return router;
}

export default createPublicPortfolioRouter();
