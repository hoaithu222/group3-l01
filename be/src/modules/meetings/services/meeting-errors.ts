import { AppError, ValidationError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../../core/utils/error.codes";

export function meetError(code: ErrorCodeType, status: 400 | 403 | 404 | 409 | 410 | 503, details?: unknown): AppError {
  return new AppError(ErrorMessages[code], status, code, details);
}

export const meetNotFound = (): AppError => meetError(ErrorCode.MEET_001, 404);
export const reasonRequired = (): ValidationError => new ValidationError("Lý do bắt buộc", { reason: ["Lý do bắt buộc khi thao tác với vai trò quản trị"] });
export const workspaceReadonly = (): AppError => meetError(ErrorCode.WS_002, 403);
