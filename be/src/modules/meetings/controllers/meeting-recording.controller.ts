import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ConsentResponseDto, DeleteRecordingQueryDto, RecordingUrlQueryDto, StartRecordingDto } from "../dtos";
import type { MeetingsContainer } from "../meetings.container";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Controller mỏng của ghi hình (be.md §4): đồng ý → bắt đầu/dừng → danh sách/chi tiết/URL → xoá/thử lại import. */
export function createMeetingRecordingController(c: MeetingsContainer) {
  const consent = () => c.recapRecording.consent;
  const rec = () => c.recapRecording.recording;

  const consentRequest = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await consent().request(userOf(req), req.params.meetingId), "Đã gửi yêu cầu đồng ý ghi hình");
  });

  const consentRespond = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await consent().respond(userOf(req), req.params.meetingId, req.body as ConsentResponseDto), "Đã ghi nhận lựa chọn của bạn");
  });

  const consentStatus = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await consent().status(userOf(req), req.params.meetingId), "Tiến độ đồng ý ghi hình");
  });

  const start = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await rec().start(userOf(req), req.params.meetingId, req.body as StartRecordingDto), "Đã bắt đầu ghi hình", 201);
  });

  const stop = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await rec().stop(userOf(req), req.params.recordingId), "Đã dừng ghi hình");
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await rec().list(userOf(req), req.params.meetingId), "Bản ghi của cuộc họp");
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await rec().get(userOf(req), req.params.recordingId), "Bản ghi");
  });

  const url = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await rec().url(userOf(req), req.params.recordingId, req.query as unknown as RecordingUrlQueryDto));
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await rec().delete(userOf(req), req.params.recordingId, req.query as unknown as DeleteRecordingQueryDto);
    res.status(204).send();
  });

  const retryImport = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await rec().retryImport(userOf(req), req.params.recordingId), "Đang xử lý lại bản ghi", 202);
  });

  return { consentRequest, consentRespond, consentStatus, start, stop, list, get, url, remove, retryImport };
}
