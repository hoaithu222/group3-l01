import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AttemptEventDto, CreateAttemptDto, ListAttemptsQueryDto, PutAnswersDto, SubmitDto } from "../dtos";
import type { MockAttemptService } from "../services/mock-attempt.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createMockAttemptController(s: MockAttemptService) {
  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.create(requireUser(req), req.params.id, req.body as CreateAttemptDto), "Đã bắt đầu bài thi", 201);
  });

  const listBySet = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await s.listBySet(requireUser(req), req.params.id, req.query as unknown as ListAttemptsQueryDto), "Lịch sử thi thử của bộ học");
  });

  const listMine = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await s.listMine(requireUser(req), req.query as unknown as ListAttemptsQueryDto), "Lịch sử thi thử của tôi");
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.get(requireUser(req), req.params.id));
  });

  const putAnswers = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.putAnswers(requireUser(req), req.params.id, req.body as PutAnswersDto), "Đã lưu đáp án");
  });

  const recordEvent = catchAsync(async (req: Request, res: Response) => {
    await s.recordEvent(requireUser(req), req.params.id, req.body as AttemptEventDto);
    res.status(204).send();
  });

  const submit = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.submit(requireUser(req), req.params.id, req.body as SubmitDto), "Đã nộp bài");
  });

  return { create, listBySet, listMine, get, putAnswers, recordEvent, submit };
}
