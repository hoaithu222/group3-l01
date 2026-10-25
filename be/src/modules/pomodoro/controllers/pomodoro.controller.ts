import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CommandDto, ConfigDto, GoalDto, HistoryQueryDto, JoinDto } from "../dtos";
import type { PomodoroContainer } from "../pomodoro.container";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Controller mỏng: parse request → gọi service → `ResponseUtils` (be.md §4). Mọi DTO do server dựng; `myActions`/`rules` tính ở service. */
export function createPomodoroController(c: Pick<PomodoroContainer, "service" | "join" | "presence">) {
  const channelId = (req: Request): string => req.params.channelId;

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.getSnapshot(userOf(req), channelId(req)));
  });

  const updateConfig = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.updateConfig(userOf(req), channelId(req), req.body as ConfigDto), "Đã cập nhật cấu hình");
  });

  const start = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.start(userOf(req), channelId(req), req.body as CommandDto), "Đã bắt đầu phiên");
  });

  const pause = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.pause(userOf(req), channelId(req), req.body as CommandDto), "Đã tạm dừng");
  });

  const resume = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.resume(userOf(req), channelId(req), req.body as CommandDto), "Đã tiếp tục");
  });

  const skip = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.skip(userOf(req), channelId(req), req.body as CommandDto), "Đã bỏ qua giai đoạn");
  });

  const end = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.end(userOf(req), channelId(req), req.body as CommandDto), "Đã kết thúc phiên");
  });

  const setGoal = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.presence.setGoal(userOf(req), channelId(req), req.body as GoalDto), "Đã lưu mục tiêu");
  });

  const join = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.join.join(userOf(req), channelId(req), req.body as JoinDto), "Đã vào phòng");
  });

  const summary = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.presence.sessionResult(userOf(req), channelId(req), req.params.sessionId));
  });

  const history = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as HistoryQueryDto;
    const page = await c.presence.history(userOf(req), q);
    ResponseUtils.cursor(res, { data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: q.limit } }, "Lịch sử Pomodoro");
  });

  return { get, updateConfig, start, pause, resume, skip, end, setGoal, join, summary, history };
}
