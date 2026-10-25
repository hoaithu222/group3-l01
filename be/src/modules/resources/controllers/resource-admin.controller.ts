import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { ResourceAdminService } from "../services/resource-admin.service";
import type { ResetResourceQuotaDto, SetResourceQuotaDto } from "../dtos";

function requireActor(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return { id: req.user.id, role: req.user.role };
}

export function createResourceAdminController(service: ResourceAdminService) {
  const stats = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.stats(req.params.workspaceId));
  });

  const setQuota = catchAsync(async (req: Request, res: Response) => {
    const { bytes, reason } = req.body as SetResourceQuotaDto;
    const result = await service.setQuota(requireActor(req), req.params.workspaceId, bytes, reason);
    ResponseUtils.success(res, result, "Đã đặt hạn mức riêng cho nhóm");
  });

  const resetQuota = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as ResetResourceQuotaDto;
    const result = await service.resetQuota(requireActor(req), req.params.workspaceId, reason);
    ResponseUtils.success(res, result, "Đã đưa hạn mức về mặc định");
  });

  return { stats, setQuota, resetQuota };
}
