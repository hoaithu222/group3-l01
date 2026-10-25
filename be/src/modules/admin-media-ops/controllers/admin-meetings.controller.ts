import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminMeetingListQueryDto, ForceEndDto } from "../dtos";
import type { AdminMediaForceEndService } from "../services/admin-media-force-end.service";
import type { AdminMediaQueryService } from "../services/admin-media-query.service";

/** Controller mỏng cho tab "Cuộc họp" (p2-07): danh sách/chi tiết CHỈ metadata + kết thúc cưỡng bức (202, xử lý bất đồng bộ qua outbox). */
export function createAdminMeetingsController(query: () => AdminMediaQueryService, forceEnd: () => AdminMediaForceEndService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.paginated(res, await query().listMeetings(req.query as unknown as AdminMeetingListQueryDto), "Cuộc họp toàn nền tảng");
  });

  const detail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query().meetingDetail(req.params.meetingId), "Chi tiết cuộc họp");
  });

  const forceEndMeeting = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as ForceEndDto;
    ResponseUtils.success(res, await forceEnd().forceEndMeeting({ id: req.user.id, role: req.user.role }, req.params.meetingId, reason), "Đã yêu cầu kết thúc cuộc họp", 202);
  });

  return { list, detail, forceEnd: forceEndMeeting };
}
