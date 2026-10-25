import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../../core/utils/error.codes";

export function mediaOpsError(code: ErrorCodeType, status: 400 | 404 | 409 | 410, details?: unknown): AppError {
  return new AppError(ErrorMessages[code], status, code, details);
}

export const meetingNotFound = (): AppError => mediaOpsError(ErrorCode.MEET_001, 404);
export const callNotFound = (): AppError => mediaOpsError(ErrorCode.CALL_005, 404);
export const callAlreadyEnded = (): AppError => mediaOpsError(ErrorCode.CALL_005, 410);
export const statsRangeInvalid = (): AppError => mediaOpsError(ErrorCode.ADMIN_MEDIA_001, 400);
export const callBelongsToMeeting = (meetingId: string): AppError => mediaOpsError(ErrorCode.ADMIN_MEDIA_002, 409, { meetingId });
export const meetingNotLive = (): AppError => mediaOpsError(ErrorCode.MEET_009, 409);
