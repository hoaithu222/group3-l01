import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminWorkspaceMeetingsQueryDto } from "../dtos";
import type { AdminMeetingQueryService } from "../services/admin-meeting-query.service";

/** Controller mỏng cho admin xem lịch họp của workspace — không có hành động ghi (force-end thuộc p2-07). */
export function createAdminMeetingsController(service: AdminMeetingQueryService) {
  const listByWorkspace = catchAsync(async (req: Request, res: Response) => {
    const result = await service.listByWorkspace(req.params.workspaceId, req.query as unknown as AdminWorkspaceMeetingsQueryDto);
    ResponseUtils.paginated(res, result, "Cuộc họp của workspace");
  });

  return { listByWorkspace };
}
