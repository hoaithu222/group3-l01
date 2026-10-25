import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { EndMeetingDto, JoinMeetingDto, LeaveMeetingDto, StartMeetingDto } from "../dtos";
import type { MeetingsContainer } from "../meetings.container";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Controller mỏng của phòng họp (be.md §4): parse request → gọi service → `ResponseUtils`. Mọi quyết định (trạng thái, quyền, vai) nằm ở service. */
export function createMeetingRoomController(c: MeetingsContainer) {
  /** `start` trả kết quả `join` (token vào phòng) kèm chi tiết cuộc họp mới nhất (`myActions` đã tính lại). */
  const start = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const join = await c.room.lifecycle.start(user, req.params.meetingId, req.body as StartMeetingDto);
    ResponseUtils.success(res, { ...join, meeting: await c.query.getDetail(user, req.params.meetingId) }, "Đã bắt đầu cuộc họp");
  });

  const join = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.join.join(userOf(req), req.params.meetingId, req.body as JoinMeetingDto));
  });

  const snapshot = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.query.snapshot(userOf(req), req.params.meetingId));
  });

  const leave = catchAsync(async (req: Request, res: Response) => {
    await c.room.leave.leave(userOf(req), req.params.meetingId, req.body as LeaveMeetingDto);
    res.status(204).send();
  });

  const end = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    await c.room.lifecycle.end(user, req.params.meetingId, req.body as EndMeetingDto);
    ResponseUtils.success(res, await c.query.getDetail(user, req.params.meetingId), "Đã kết thúc cuộc họp");
  });

  const chatGroup = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.chatGroup.ensure(userOf(req), req.params.meetingId), "Nhóm chat cuộc họp");
  });

  return { start, join, snapshot, leave, end, chatGroup };
}
