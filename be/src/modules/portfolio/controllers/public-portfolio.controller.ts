import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import type { PortfolioPublicService } from "../services/portfolio-public.service";
import { PUBLIC_MAX_AGE_SECONDS, PUBLIC_PAGE_CSP, sendNotFoundPage, setPageHeaders } from "./portfolio-http";

/** Trang công khai `GET /p/:slug` và ảnh `GET /p/:slug/assets/:file` — NGOÀI `/api`, không xác thực, không JSON envelope (HTML/ảnh thẳng). */
export function createPublicPortfolioController(svc: PortfolioPublicService, baseUrl: () => string) {
  const page = catchAsync(async (req: Request, res: Response) => {
    const resolution = await svc.resolve(req.params.slug);
    if (resolution.kind === "REDIRECT") {
      // Slug cũ (đổi trong `slugReserveDays` ngày) → 301 sang slug mới.
      setPageHeaders(res, { csp: PUBLIC_PAGE_CSP, indexable: false, cacheControl: `public, max-age=${PUBLIC_MAX_AGE_SECONDS}` });
      res.redirect(301, `${baseUrl()}/${resolution.to}`);
      return;
    }
    const html = resolution.kind === "PAGE" ? await svc.page(resolution) : null;
    if (resolution.kind !== "PAGE" || !html) return sendNotFoundPage(res);
    setPageHeaders(res, { csp: PUBLIC_PAGE_CSP, indexable: resolution.seoIndexable, cacheControl: `public, max-age=${PUBLIC_MAX_AGE_SECONDS}` });
    res.status(200).type("text/html; charset=utf-8").send(html);
  });

  const asset = catchAsync(async (req: Request, res: Response) => {
    const image = await svc.asset(req.params.slug, req.params.file);
    if (!image) {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(404).end();
      return;
    }
    // Ngắn hạn như trang HTML: ảnh gắn với hồ sơ đang công khai nên phải biến mất cùng trang (Unpublish ≤ 5 phút), không cache một năm.
    res.setHeader("Cache-Control", `public, max-age=${PUBLIC_MAX_AGE_SECONDS}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex");
    res.status(200).type("image/webp").send(image);
  });

  return { page, asset };
}
