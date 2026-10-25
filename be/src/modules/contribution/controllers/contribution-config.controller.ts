import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { PutContributionConfigDto } from "../dtos";
import type { ContributionConfigService } from "../services/contribution-config.service";

const actor = (req: Request) => req.user!;

export function createContributionConfigController(config: ContributionConfigService) {
  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await config.get(actor(req), req.params.id), "Công thức đóng góp");
  });

  const put = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await config.put(actor(req), req.params.id, req.body as PutContributionConfigDto), "Đã cập nhật công thức, báo cáo đang được tính lại");
  });

  return { get, put };
}
