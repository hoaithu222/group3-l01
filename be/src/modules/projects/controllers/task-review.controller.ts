import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { MyReviewsQueryDto, ReassignReviewDto, SubmitReviewDto, WaiveReviewDto } from "../dtos";
import type { ReviewQueryService } from "../services/review/review-query.service";
import type { ReviewReassignService } from "../services/review/review-reassign.service";
import type { ReviewSubmitService } from "../services/review/review-submit.service";
import type { ReviewWaiveService } from "../services/review/review-waive.service";

const actor = (req: Request) => req.user!;

/** Lượt chấm của thẻ: xem, nộp, giao lại, miễn, hộp "Cần chấm của tôi" (p4-05 be.md §4). */
export function createTaskReviewController(
  query: ReviewQueryService,
  submit: ReviewSubmitService,
  reassign: ReviewReassignService,
  waive: ReviewWaiveService
) {
  const forTask = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.forTask(actor(req), req.params.id));
  });
  const submitReview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await submit.submit(actor(req), req.params.id, req.body as SubmitReviewDto), "Đã gửi kết quả chấm");
  });
  const reassignReview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await reassign.reassign(actor(req), req.params.id, req.body as ReassignReviewDto), "Đã giao lại người chấm");
  });
  const waiveReview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await waive.waive(actor(req), req.params.id, req.body as WaiveReviewDto), "Đã miễn chấm");
  });
  const mine = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await query.mine(actor(req), req.query as unknown as MyReviewsQueryDto));
  });
  return { forTask, submitReview, reassignReview, waiveReview, mine };
}
