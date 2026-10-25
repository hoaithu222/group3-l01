import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import type { AdminStorageService } from "./admin-storage.service";
import type { StorageStatsQuery, StorageCleanupDto } from "./admin-storage.validators";

export function createAdminStorageController(service: AdminStorageService) {
  const getStats = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as StorageStatsQuery;
    const stats = await service.getStats(query);
    ResponseUtils.success(res, stats, "Thống kê lưu trữ");
  });

  const cleanup = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as StorageCleanupDto;
    const result = await service.requestCleanup(reason, req.user!.id, req.user!.role);
    ResponseUtils.success(
      res,
      result,
      result.alreadyQueued
        ? "Đã có lượt dọn thủ công trong giờ này"
        : "Đã yêu cầu dọn tệp mồ côi"
    );
  });

  return { getStats, cleanup };
}
