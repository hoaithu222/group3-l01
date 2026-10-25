import { AppError, NotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/** Mã lỗi `PLAG_*` (p7-05 be.md §8) — factory dùng chung thông điệp/HTTP giữa các service. */
export const plagiarismErrors = {
  invalidTargetCount: (details?: unknown) => make(ErrorCode.PLAG_001, 400, details),
  unsupportedTargets: (resourceIds: string[]) => make(ErrorCode.PLAG_002, 422, { resourceIds }),
  tooManyConcurrentScans: () => make(ErrorCode.PLAG_003, 409),
  dailyScanLimitReached: () => make(ErrorCode.PLAG_004, 429),
  scanNotReady: () => make(ErrorCode.PLAG_005, 409),
  reportExpired: () => make(ErrorCode.PLAG_006, 410),
  /** 404 trung tính cho tệp không thấy/không thuộc workspace/không còn quyền xem (không nói tệp nào — be.md §5.2 bước 2). */
  resourceNotFound: () => new NotFoundError("Không tìm thấy tệp hoặc bạn không có quyền xem"),
} as const;
