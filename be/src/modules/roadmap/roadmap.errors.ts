import { AppError, ScopeNotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";

/** Mã lỗi `RMAP_*` (be.md §8) — factory để service dùng chung một thông điệp/HTTP. */
export const roadmapErrors = {
  slugTaken: () => new AppError(ErrorMessages[ErrorCode.RMAP_001], 409, ErrorCode.RMAP_001),
  invalidContent: (details?: unknown) => new AppError(ErrorMessages[ErrorCode.RMAP_002], 400, ErrorCode.RMAP_002, details),
  phaseHasLessons: () => new AppError(ErrorMessages[ErrorCode.RMAP_003], 409, ErrorCode.RMAP_003),
  enrollmentState: (reason: string) => new AppError(ErrorMessages[ErrorCode.RMAP_004], 409, ErrorCode.RMAP_004, { reason }),
  noPublishedLessons: () => new AppError(ErrorMessages[ErrorCode.RMAP_005], 409, ErrorCode.RMAP_005),
  lessonLocked: () => new AppError(ErrorMessages[ErrorCode.RMAP_006], 403, ErrorCode.RMAP_006),
  unknownChecklistItem: () => new AppError(ErrorMessages[ErrorCode.RMAP_007], 400, ErrorCode.RMAP_007),
  limitExceeded: (what: string, max: number) => new AppError(ErrorMessages[ErrorCode.RMAP_008], 409, ErrorCode.RMAP_008, { what, max }),
  /** 404 trung tính — không phân biệt "không có" / "đã xoá" / "chưa xuất bản" (02-conventions §2). */
  notFound: () => new ScopeNotFoundError(),
} as const;
