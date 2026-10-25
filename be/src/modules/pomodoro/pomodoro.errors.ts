import { AppError } from "../../core/exceptions";
import { ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";

/** Lỗi nghiệp vụ Pomodoro có mã trong từ điển `error.codes.ts` (`CALL_POMO_*` + các mã `CALL_*` dùng lại của phòng thoại). */
export function pomodoroError(code: ErrorCodeType, status: 400 | 403 | 404 | 409 | 410 | 503, details?: unknown): AppError {
  return new AppError(ErrorMessages[code], status, code, details);
}
