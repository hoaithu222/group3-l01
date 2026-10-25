import { AppError, ForbiddenError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";

/** Mã lỗi `QUIZ_*` (p5-01 be.md §8) — factory để service/controller dùng chung một thông điệp/HTTP. */
export const quizErrors = {
  /** 404 — PIN sai/hết hạn, HOẶC không phải người trong phiên (không phân biệt để không lộ phiên tồn tại). */
  notFound: () => new AppError(ErrorMessages[ErrorCode.QUIZ_001], 404, ErrorCode.QUIZ_001),
  ended: () => new AppError(ErrorMessages[ErrorCode.QUIZ_002], 410, ErrorCode.QUIZ_002),
  full: (max: number) => new AppError(ErrorMessages[ErrorCode.QUIZ_003], 409, ErrorCode.QUIZ_003, { max }),
  alreadyAnswered: () => new AppError(ErrorMessages[ErrorCode.QUIZ_004], 409, ErrorCode.QUIZ_004),
  closed: () => new AppError(ErrorMessages[ErrorCode.QUIZ_005], 409, ErrorCode.QUIZ_005),
  notEnoughQuestions: () => new AppError(ErrorMessages[ErrorCode.QUIZ_006], 400, ErrorCode.QUIZ_006),
  invalidState: (status?: string) => new AppError(ErrorMessages[ErrorCode.QUIZ_007], 409, ErrorCode.QUIZ_007, status ? { status } : undefined),
  pinExhausted: () => new AppError(ErrorMessages[ErrorCode.QUIZ_009], 503, ErrorCode.QUIZ_009),
  kicked: () => new AppError(ErrorMessages[ErrorCode.QUIZ_010], 403, ErrorCode.QUIZ_010),
  /** Phiên gắn workspace mà người dùng không phải thành viên ACTIVE (khách/người ngoài) — 403 `PERM_001` (be.md §4; app dịch thành "Phiên chỉ dành cho thành viên nhóm"). */
  notWorkspaceMember: () => new AppError(ErrorMessages[ErrorCode.PERM_001], 403, ErrorCode.PERM_001),
  /** Người trong phiên nhưng không phải host (403). */
  hostOnly: () => new ForbiddenError("Chỉ chủ phòng mới được thực hiện thao tác này"),
  /** Redis mất kết nối — KHÔNG fail-open (điểm/đáp án là trạng thái nóng duy nhất của phiên). */
  unavailable: () => new AppError(ErrorMessages[ErrorCode.SYS_503], 503, ErrorCode.SYS_503),
} as const;
