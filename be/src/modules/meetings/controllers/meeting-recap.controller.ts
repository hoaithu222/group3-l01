import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AttachRecapAssetDto, PublishRecapDto, UpsertRecapDto } from "../dtos";
import type { MeetingsContainer } from "../meetings.container";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Controller mỏng của biên bản họp (be.md §4): parse request → `MeetingRecapService` → `ResponseUtils`. Quyền/trạng thái/CAS nằm ở service. */
export function createMeetingRecapController(c: MeetingsContainer) {
  const svc = () => c.recapRecording.recap;

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc().get(userOf(req), req.params.meetingId), "Biên bản họp");
  });

  const upsert = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc().upsert(userOf(req), req.params.meetingId, req.body as UpsertRecapDto), "Đã lưu biên bản");
  });

  const publish = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc().publish(userOf(req), req.params.meetingId, req.body as PublishRecapDto), "Đã công bố biên bản");
  });

  const attach = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc().attach(userOf(req), req.params.meetingId, (req.body as AttachRecapAssetDto).assetId), "Đã đính kèm tệp");
  });

  /** Trả `RecapDto` mới (đổi `version`, `attachmentCount`) thay vì 204 để client đồng bộ phiên bản ngay, khỏi gọi lại `GET`. */
  const detach = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc().detach(userOf(req), req.params.meetingId, req.params.assetId), "Đã gỡ tệp đính kèm");
  });

  return { get, upsert, publish, attach, detach };
}
