import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { MuteAllDto, MuteParticipantDto, ParticipantRoleDto, RemoveParticipantDto, TransferControlDto } from "../dtos";
import type { MeetingsContainer } from "../meetings.container";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Điều khiển phòng của chủ trì/đồng chủ trì (be.md §4, §5.5): tắt mic, mời ra, khoá, cấp vai phiên, hạ tay (mọi người / một người). */
export function createMeetingHostController(c: MeetingsContainer) {
  const mute = catchAsync(async (req: Request, res: Response) => {
    await c.room.host.mute(userOf(req), req.params.meetingId, req.params.userId, req.body as MuteParticipantDto);
    res.status(204).send();
  });

  const muteAll = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.host.muteAll(userOf(req), req.params.meetingId, req.body as MuteAllDto), "Đã tắt mic mọi người");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await c.room.host.remove(userOf(req), req.params.meetingId, req.params.userId, req.body as RemoveParticipantDto);
    res.status(204).send();
  });

  const lock = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.host.setLock(userOf(req), req.params.meetingId, true), "Đã khoá cuộc họp");
  });

  const unlock = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.room.host.setLock(userOf(req), req.params.meetingId, false), "Đã mở khoá cuộc họp");
  });

  const setRole = catchAsync(async (req: Request, res: Response) => {
    const p = await c.room.host.setSessionRole(userOf(req), req.params.meetingId, req.params.userId, req.body as ParticipantRoleDto);
    ResponseUtils.success(res, { userId: p.userId, role: p.role, state: p.state, mutedByHost: p.mutedByHost }, "Đã đổi vai trò trong phòng");
  });

  const lowerAllHands = catchAsync(async (req: Request, res: Response) => {
    await c.room.host.lowerAllHands(userOf(req), req.params.meetingId);
    res.status(204).send();
  });

  const lowerHand = catchAsync(async (req: Request, res: Response) => {
    await c.room.host.lowerHand(userOf(req), req.params.meetingId, req.params.userId);
    res.status(204).send();
  });

  const transferControl = catchAsync(async (req: Request, res: Response) => {
    await c.room.host.transferControl(userOf(req), req.params.meetingId, (req.body as TransferControlDto).toUserId);
    res.status(204).send();
  });

  return { mute, muteAll, remove, lock, unlock, setRole, lowerAllHands, lowerHand, transferControl };
}
