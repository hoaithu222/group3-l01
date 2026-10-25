import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { TakedownDto } from "../dtos";
import type { PortfolioPublishService } from "../services/portfolio-publish.service";
import { requireUser } from "./portfolio-http";

/** Gỡ vi phạm / mở lại portfolio (`moderation:view|update`) — UI nằm trong drawer báo cáo p1-08. */
export function createAdminPortfolioController(svc: PortfolioPublishService) {
  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc.adminGet(req.params.portfolioId), "Portfolio");
  });

  const takedown = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc.takedown(requireUser(req), req.params.portfolioId, req.body as TakedownDto), "Đã gỡ portfolio");
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as { reason: string };
    ResponseUtils.success(res, await svc.restore(requireUser(req), req.params.portfolioId, reason), "Đã mở lại portfolio");
  });

  return { get, takedown, restore };
}
