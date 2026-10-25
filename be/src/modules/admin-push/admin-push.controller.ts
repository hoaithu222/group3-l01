import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { UnauthorizedError } from "../../core/exceptions";
import type { AdminPushService } from "./admin-push.service";
import type { AdminPushStatsService } from "./admin-push-stats.service";
import type { AdminPushTestDto } from "./admin-push.validators";

export function createAdminPushController(service: AdminPushService, stats: AdminPushStatsService) {
  const sendTest = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { userId, type, reason } = req.body as AdminPushTestDto;
    const result = await service.sendTest({
      actorId: req.user.id,
      actorRole: req.user.role,
      targetUserId: userId,
      type,
      reason,
    });
    ResponseUtils.success(res, result, "Đã gửi push thử");
  });

  // `getStatus()` đồng bộ (chỉ đọc cờ/credential đã nạp) — `catchAsync` vẫn cần Promise trả về.
  const getStatus = catchAsync((_req: Request, res: Response) => {
    ResponseUtils.success(res, stats.getStatus(), "Trạng thái nhà cung cấp push");
    return Promise.resolve();
  });

  const getStats = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await stats.getStats(), "Số liệu push");
  });

  return { sendTest, getStatus, getStats };
}
