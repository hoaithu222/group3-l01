import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { DueQueryDto, EnrollDto, ReviewDto, SummaryQueryDto } from "../dtos";
import type { SrReviewService } from "../services/sr-review.service";
import type { SrService } from "../services/sr.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createSrController(sr: SrService, reviews: SrReviewService) {
  const enroll = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await sr.enroll(requireUser(req), req.body as EnrollDto), "Đã đăng ký ôn theo lịch", 201);
  });

  const unenroll = catchAsync(async (req: Request, res: Response) => {
    await sr.unenroll(requireUser(req), req.params.setId);
    res.status(204).send();
  });

  const due = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await sr.due(requireUser(req), req.query as unknown as DueQueryDto));
  });

  const review = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await reviews.review(requireUser(req), req.body as ReviewDto), "Đã ghi nhận lượt ôn");
  });

  const summary = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await sr.summary(requireUser(req), req.query as unknown as SummaryQueryDto));
  });

  return { enroll, unenroll, due, review, summary };
}
