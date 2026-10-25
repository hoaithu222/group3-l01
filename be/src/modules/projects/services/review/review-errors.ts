import { AppError, ScopeForbiddenError } from "../../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";

/** Lỗi nghiệp vụ chấm chéo (p4-05 be.md §8) — MỘT nơi dựng để service/consumer không lệch mã/HTTP. */

export const reviewClosedError = (): AppError => new AppError(ErrorMessages[ErrorCode.REVIEW_001], 409, ErrorCode.REVIEW_001);

export const selfReviewError = (): AppError => new AppError(ErrorMessages[ErrorCode.REVIEW_003], 409, ErrorCode.REVIEW_003);

/** `details` = lỗi theo trường (`{ rubric: ["…"] }`, `{ reviewerPool: ["…"] }`) để app tô đúng chỗ. */
export const invalidConfigError = (details: Record<string, string[]>): AppError => new AppError(ErrorMessages[ErrorCode.REVIEW_004], 400, ErrorCode.REVIEW_004, details);

export const noReviewerError = (): AppError => new AppError(ErrorMessages[ErrorCode.REVIEW_005], 409, ErrorCode.REVIEW_005);

export const feedbackRequiredError = (): AppError =>
  new AppError(ErrorMessages[ErrorCode.REVIEW_006], 400, ErrorCode.REVIEW_006, { feedback: ["Vui lòng ghi nhận xét khi yêu cầu sửa"] });

export const noOpenRoundError = (): AppError => new AppError(ErrorMessages[ErrorCode.REVIEW_007], 409, ErrorCode.REVIEW_007);

/** 403: thấy thẻ nhưng không phải việc của mình (không phải người được giao chấm, bảng đã lưu trữ…). */
export const forbiddenError = (): ScopeForbiddenError => new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
