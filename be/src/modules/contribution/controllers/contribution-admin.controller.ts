import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ContributionStatsService } from "../services/contribution-stats.service";

export function createContributionAdminController(stats: ContributionStatsService) {
  const get = catchAsync(async (req: Request, res: Response) => {
    const days = (req.query as unknown as { days: number }).days;
    ResponseUtils.success(res, await stats.get(req.params.id, days), "Số liệu báo cáo đóng góp");
  });

  return { get };
}
