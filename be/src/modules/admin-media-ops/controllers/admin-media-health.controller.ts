import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { WorkspaceMediaStatsQueryDto } from "../dtos";
import type { AdminMediaHealthService } from "../services/admin-media-health.service";
import type { AdminMediaStatsService } from "../services/admin-media-stats.service";

/** `GET /admin/media/health` (luôn 200 — phần lỗi nằm trong body) và `GET /admin/workspaces/:workspaceId/media-stats` (chỉ số lượng). */
export function createAdminMediaHealthController(health: () => AdminMediaHealthService, stats: () => AdminMediaStatsService) {
  const check = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await health().check(), "Sức khoẻ hạ tầng media");
  });

  const workspaceStats = catchAsync(async (req: Request, res: Response) => {
    const { days } = req.query as unknown as WorkspaceMediaStatsQueryDto;
    ResponseUtils.success(res, await stats().workspaceStats(req.params.workspaceId, days), "Thống kê gọi & họp của workspace");
  });

  return { check, workspaceStats };
}
