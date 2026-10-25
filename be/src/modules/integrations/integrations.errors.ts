import { AppError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";

type IntStatus = 400 | 401 | 403 | 404 | 409 | 410 | 502;

/** Lỗi nghiệp vụ tích hợp có mã trong từ điển `error.codes.ts` (`INT_001..010`) — trạng thái HTTP theo p5-03 be.md §8. */
export function integrationError(code: ErrorCodeType, status: IntStatus, details?: unknown, message?: string): AppError {
  return new AppError(message ?? ErrorMessages[code], status, code, details);
}

export const intErrors = {
  providerDisabled: () => integrationError(ErrorCode.INT_001, 400),
  limitReached: (max: number) => integrationError(ErrorCode.INT_002, 409, { max }),
  stateInvalid: () => integrationError(ErrorCode.INT_003, 400),
  providerFailed: (details?: unknown) => integrationError(ErrorCode.INT_004, 502, details),
  targetForbidden: (details?: unknown) => integrationError(ErrorCode.INT_005, 403, details),
  eventExpired: () => integrationError(ErrorCode.INT_006, 410),
  badSignature: () => integrationError(ErrorCode.INT_007, 401),
  accountTaken: () => integrationError(ErrorCode.INT_008, 409),
  unsupportedEvent: (details?: unknown) => integrationError(ErrorCode.INT_009, 400, details),
  revoked: () => integrationError(ErrorCode.INT_010, 409),
};
