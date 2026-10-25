import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ChangeSlugDto, PreviewQueryDto, UpdatePortfolioDto } from "../dtos";
import type { PortfolioPreviewService } from "../services/portfolio-preview.service";
import type { PortfolioPublishService } from "../services/portfolio-publish.service";
import type { PortfolioService } from "../services/portfolio.service";
import { PREVIEW_PAGE_CSP, requireUser, setPageHeaders } from "./portfolio-http";

/** Hồ sơ, slug, mẫu, xem trước, Công khai/Ngừng công khai của CHÍNH MÌNH + link portfolio của người khác (be.md §4). */
export function createPortfolioController(portfolio: PortfolioService, publish: PortfolioPublishService, preview: PortfolioPreviewService) {
  const overview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await portfolio.overview(requireUser(req).id), "Hồ sơ portfolio");
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await portfolio.update(requireUser(req).id, req.body as UpdatePortfolioDto), "Đã lưu hồ sơ");
  });

  const changeSlug = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await portfolio.changeSlug(requireUser(req).id, req.body as ChangeSlugDto), "Đã đổi đường dẫn");
  });

  const slugAvailable = catchAsync(async (req: Request, res: Response) => {
    const { slug } = req.query as { slug: string };
    ResponseUtils.success(res, await portfolio.slugAvailability(requireUser(req).id, slug), "Kiểm tra đường dẫn");
  });

  const templates = catchAsync((_req: Request, res: Response) => {
    ResponseUtils.success(res, portfolio.templates(), "Mẫu portfolio");
    return Promise.resolve();
  });

  const previewPage = catchAsync(async (req: Request, res: Response) => {
    const html = await preview.render(requireUser(req).id, req.query as PreviewQueryDto);
    setPageHeaders(res, { csp: PREVIEW_PAGE_CSP, indexable: false, cacheControl: "no-store" });
    res.status(200).type("text/html; charset=utf-8").send(html);
  });

  const publishNow = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion } = req.body as { expectedVersion: number };
    ResponseUtils.success(res, await publish.publish(requireUser(req).id, expectedVersion), "Đã xếp lịch tạo trang", 202);
  });

  const unpublish = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await publish.unpublish(requireUser(req).id), "Đã ngừng công khai");
  });

  const latestBuild = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await publish.latestBuild(requireUser(req).id), "Lần tạo trang gần nhất");
  });

  const link = catchAsync(async (req: Request, res: Response) => {
    requireUser(req);
    ResponseUtils.success(res, await publish.linkOf(req.params.userId), "Liên kết portfolio");
  });

  return { overview, update, changeSlug, slugAvailable, templates, previewPage, publishNow, unpublish, latestBuild, link };
}
