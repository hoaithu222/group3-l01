import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { SystemConfigService } from "../services/system-config.service";
import type { UpdateSystemConfigDto, ResetSystemConfigDto } from "../dtos/update-system-config.dto";

export function createSystemConfigController(service: SystemConfigService) {
  const getList = catchAsync(async (_req: Request, res: Response) => {
    const data = await service.list();
    ResponseUtils.success(res, data);
  });

  const getOne = catchAsync(async (req: Request, res: Response) => {
    const data = await service.getOne(req.params.key);
    ResponseUtils.success(res, data);
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as UpdateSystemConfigDto;
    const data = await service.update(req.params.key, body, { id: req.user!.id, role: req.user!.role });
    ResponseUtils.success(res, data, "Cập nhật cấu hình thành công");
  });

  const reset = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as ResetSystemConfigDto;
    const data = await service.reset(req.params.key, body, { id: req.user!.id, role: req.user!.role });
    ResponseUtils.success(res, data, "Đã đặt lại về mặc định");
  });

  return { getList, getOne, update, reset };
}
