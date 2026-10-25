import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { getAdminInsights } from "./admin-overview-insights.service";
import { buildAdminOverview } from "./admin-overview.service";
import type { InsightsQuery, OverviewQuery } from "./admin-overview.validators";

export function createAdminOverviewController() {
  const get = catchAsync(async (req: Request, res: Response) => {
    const { range } = req.query as unknown as OverviewQuery;
    const overview = await buildAdminOverview(range);
    // Số liệu tổng hợp, không đổi theo từng request — cache ngắn phía client.
    res.setHeader("Cache-Control", "private, max-age=60");
    ResponseUtils.success(res, overview);
  });

  const insights = catchAsync(async (req: Request, res: Response) => {
    const { range } = req.query as unknown as InsightsQuery;
    const data = await getAdminInsights(range);
    // BE đã cache ~60 s trong bộ nhớ; header này cho trình duyệt admin khỏi gọi lại khi chuyển tab qua lại.
    res.setHeader("Cache-Control", "private, max-age=60");
    ResponseUtils.success(res, data);
  });

  return { get, insights };
}
