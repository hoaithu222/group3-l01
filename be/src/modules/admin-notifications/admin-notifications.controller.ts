import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import type { AdminNotificationsService } from "./admin-notifications.service";
import type { NotificationStatsQuery } from "./admin-notifications.validators";

export function createAdminNotificationsController(service: AdminNotificationsService) {
  const stats = catchAsync(async (req: Request, res: Response) => {
    const { range } = req.query as unknown as NotificationStatsQuery;
    ResponseUtils.success(res, await service.getStats(range), "Số liệu thông báo");
  });

  return { stats };
}
