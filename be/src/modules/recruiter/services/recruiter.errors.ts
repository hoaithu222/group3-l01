import { AppError, ConflictError, NotFoundError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";

/** Lỗi nghiệp vụ `RECR_00x` (be.md §8) — mã + thông điệp lấy từ `error.codes.ts`, không hardcode chuỗi. `RECR_010` do `scopeLimiter` ném (`ScopeRateLimitError`). */
export const recruiterErrors = {
  alreadyInCompany: () => new AppError(ErrorMessages.RECR_001, HttpStatusCode.CONFLICT, ErrorCode.RECR_001),
  notApproved: () => new AppError(ErrorMessages.RECR_002, HttpStatusCode.FORBIDDEN, ErrorCode.RECR_002),
  ownerOnly: () => new AppError(ErrorMessages.RECR_003, HttpStatusCode.FORBIDDEN, ErrorCode.RECR_003),
  duplicateCompany: () => new AppError(ErrorMessages.RECR_004, HttpStatusCode.CONFLICT, ErrorCode.RECR_004),
  /** `details`: `{ period, used, quota }` — client hiện "còn 0/5 lượt tháng này". */
  quotaExceeded: (details: { period: string; used: number; quota: number }) => new AppError(ErrorMessages.RECR_005, HttpStatusCode.TOO_MANY_REQUESTS, ErrorCode.RECR_005, details),
  openOfferExists: () => new AppError(ErrorMessages.RECR_006, HttpStatusCode.CONFLICT, ErrorCode.RECR_006),
  /** CÙNG thông điệp cho mọi lý do (chưa bật Open to work / bị chặn / tài khoản không hợp lệ) — không lộ vì sao. */
  cannotOffer: () => new AppError(ErrorMessages.RECR_007, HttpStatusCode.UNPROCESSABLE_ENTITY, ErrorCode.RECR_007),
  threadClosed: () => new AppError(ErrorMessages.RECR_008, HttpStatusCode.FORBIDDEN, ErrorCode.RECR_008),
  invalidState: (details?: Record<string, unknown>) => new AppError(ErrorMessages.RECR_009, HttpStatusCode.CONFLICT, ErrorCode.RECR_009, details),
  memberElsewhere: (details?: Record<string, unknown>) => new AppError(ErrorMessages.RECR_011, HttpStatusCode.CONFLICT, ErrorCode.RECR_011, details),
  lastOwner: () => new AppError(ErrorMessages.RECR_012, HttpStatusCode.BAD_REQUEST, ErrorCode.RECR_012),
  companyNotFound: () => new NotFoundError("Không tìm thấy doanh nghiệp"),
  offerNotFound: () => new NotFoundError("Không tìm thấy lời mời"),
  talentNotFound: () => new NotFoundError("Không tìm thấy ứng viên"),
  userNotFound: () => new AppError("Không tìm thấy người dùng với email này", HttpStatusCode.NOT_FOUND, ErrorCode.USER_001),
  membersFull: (max: number) => new ConflictError(`Doanh nghiệp đã đạt số nhân sự tối đa (${max})`),
};
