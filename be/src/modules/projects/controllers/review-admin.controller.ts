import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ReviewStatsQueryDto } from "../dtos";
import type { ReviewStatsService } from "../services/review/review-stats.service";

/** `GET /admin/workspaces/:id/review-stats` — chỉ số đếm chấm chéo cho admin nền tảng (p4-05 be.md §4). */
export function createReviewAdminController(stats: ReviewStatsService) {
  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await stats.get(req.params.id, (req.query as unknown as ReviewStatsQueryDto).days));
  });
  return { get };
}
