import { AppError, ScopeNotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/** Mã lỗi `MENTOR_*` (p6-03 be.md §8) — factory để service dùng chung thông điệp/HTTP. */
export const mentorErrors = {
  tooManyOpenPosts: (max: number) => make(ErrorCode.MENTOR_001, 409, { max }),
  postNotOpen: () => make(ErrorCode.MENTOR_002, 409),
  alreadyApplied: () => make(ErrorCode.MENTOR_003, 409),
  cannotJoin: () => make(ErrorCode.MENTOR_004, 400),
  postChanged: (currentVersion?: number) => make(ErrorCode.MENTOR_005, 409, currentVersion !== undefined ? { currentVersion } : undefined),
  tooManyPending: (max: number) => make(ErrorCode.MENTOR_006, 429, { max }),
  totalDaysExceeded: (max: number, remaining: number) => make(ErrorCode.MENTOR_007, 400, { max, remaining }),
  invalidChannels: (channelIds: string[]) => make(ErrorCode.MENTOR_008, 400, { channelIds }),
  engagementEnded: () => make(ErrorCode.MENTOR_009, 409),
  applicationNotPending: () => make(ErrorCode.MENTOR_010, 409),
  /** 404 trung tính — không phân biệt "không có" / "đã ẩn" / "không được thấy" (02-conventions §2). */
  notFound: () => new ScopeNotFoundError(),
} as const;
