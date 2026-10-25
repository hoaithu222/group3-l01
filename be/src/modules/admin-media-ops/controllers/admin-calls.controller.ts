import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminCallListQueryDto, CallStatsQueryDto, ForceEndDto } from "../dtos";
import type { AdminMediaForceEndService } from "../services/admin-media-force-end.service";
import type { AdminMediaQueryService } from "../services/admin-media-query.service";
import type { AdminMediaStatsService } from "../services/admin-media-stats.service";

/** Controller mỏng cho tab "Cuộc gọi" (p2-07): metadata (không người tham gia của cuộc gọi riêng tư), thống kê, kết thúc cưỡng bức. */
export function createAdminCallsController(query: () => AdminMediaQueryService, stats: () => AdminMediaStatsService, forceEnd: () => AdminMediaForceEndService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.paginated(res, await query().listCalls(req.query as unknown as AdminCallListQueryDto), "Cuộc gọi toàn nền tảng");
  });

  const detail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query().callDetail(req.params.callId), "Chi tiết cuộc gọi");
  });

  const callStats = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await stats().callStats(req.query as unknown as CallStatsQueryDto), "Thống kê cuộc gọi");
  });

  const forceEndCall = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as ForceEndDto;
    ResponseUtils.success(res, await forceEnd().forceEndCall({ id: req.user.id, role: req.user.role }, req.params.callId, reason), "Đã yêu cầu kết thúc cuộc gọi", 202);
  });

  return { list, detail, stats: callStats, forceEnd: forceEndCall };
}
