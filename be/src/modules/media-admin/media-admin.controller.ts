import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import type { MediaAdminService } from "./media-admin.service";

export function createMediaAdminController(service: MediaAdminService) {
  const getStatus = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await service.getStatus(), "Trạng thái máy chủ media");
  });
  return { getStatus };
}
