import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CommandDto, CreateSessionDto, HistoryQueryDto, JoinDto, KickDto } from "../dtos";
import type { LiveQuizService } from "../services/live-quiz.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** `/live-quiz*` — body/params đã được validate bằng Zod ở routes. */
export function createLiveQuizController(service: LiveQuizService) {
  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.create(requireUser(req), req.body as CreateSessionDto), "Đã tạo phiên thi", 201);
  });

  const join = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.join(requireUser(req), req.body as JoinDto), "Đã vào phòng thi");
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.get(requireUser(req), req.params.id));
  });

  const start = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.advance(requireUser(req), req.params.id, "start", (req.body as CommandDto).expectedVersion));
  });

  const next = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.advance(requireUser(req), req.params.id, "next", (req.body as CommandDto).expectedVersion));
  });

  const end = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.end(requireUser(req), req.params.id, (req.body as CommandDto).expectedVersion, false));
  });

  const cancel = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.end(requireUser(req), req.params.id, (req.body as CommandDto).expectedVersion, true));
  });

  const kick = catchAsync(async (req: Request, res: Response) => {
    await service.kick(requireUser(req), req.params.id, (req.body as KickDto).userId);
    res.status(204).send();
  });

  const results = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.results(requireUser(req), req.params.id), "Kết quả phiên thi");
  });

  const history = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await service.history(requireUser(req), req.query as unknown as HistoryQueryDto), "Lịch sử thi trực tiếp");
  });

  return { create, join, get, start, next, end, cancel, kick, results, history };
}
