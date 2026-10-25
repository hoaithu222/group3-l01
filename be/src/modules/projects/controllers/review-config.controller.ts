import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { PutReviewConfigDto } from "../dtos";
import type { ReviewConfigService } from "../services/review/review-config.service";

const actor = (req: Request) => req.user!;

/** `GET/PUT /boards/:id/review-config` (p4-05 be.md §4). */
export function createReviewConfigController(config: ReviewConfigService) {
  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await config.get(actor(req), req.params.id));
  });
  const put = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await config.put(actor(req), req.params.id, req.body as PutReviewConfigDto), "Đã lưu cấu hình chấm chéo");
  });
  return { get, put };
}
