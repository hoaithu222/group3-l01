import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { MeetingsContainer } from "../meetings.container";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Phòng chờ (be.md §4): danh sách, cho vào/từ chối (từng người, tất cả), tự huỷ yêu cầu. */
export function createMeetingLobbyController(c: MeetingsContainer) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.lobby.list(userOf(req), req.params.meetingId), "Người đang chờ vào phòng");
  });

  const admit = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.lobby.admit(userOf(req), req.params.meetingId, req.params.userId));
  });

  const deny = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.lobby.deny(userOf(req), req.params.meetingId, req.params.userId));
  });

  const admitAll = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.lobby.admitAll(userOf(req), req.params.meetingId));
  });

  const cancelMine = catchAsync(async (req: Request, res: Response) => {
    await c.room.lobby.cancelMine(userOf(req), req.params.meetingId);
    res.status(204).send();
  });

  return { list, admit, deny, admitAll, cancelMine };
}
