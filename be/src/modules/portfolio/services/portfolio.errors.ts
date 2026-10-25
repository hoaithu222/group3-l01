import { AppError, NotFoundError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";

/** Lỗi nghiệp vụ `PORT_00x` (be.md §8) — mã + thông điệp lấy từ `error.codes.ts`, không hardcode chuỗi. */
export const portfolioErrors = {
  slugTaken: () => new AppError(ErrorMessages.PORT_001, HttpStatusCode.CONFLICT, ErrorCode.PORT_001),
  slugInvalid: () => new AppError(ErrorMessages.PORT_002, HttpStatusCode.BAD_REQUEST, ErrorCode.PORT_002),
  slugForbidden: () => new AppError(ErrorMessages.PORT_003, HttpStatusCode.BAD_REQUEST, ErrorCode.PORT_003),
  notEligible: () => new AppError(ErrorMessages.PORT_004, HttpStatusCode.NOT_FOUND, ErrorCode.PORT_004),
  tooManyProjects: (max: number) => new AppError(ErrorMessages.PORT_005, HttpStatusCode.CONFLICT, ErrorCode.PORT_005, { max }),
  duplicateProject: () => new AppError(ErrorMessages.PORT_006, HttpStatusCode.CONFLICT, ErrorCode.PORT_006),
  takenDown: () => new AppError(ErrorMessages.PORT_008, HttpStatusCode.FORBIDDEN, ErrorCode.PORT_008),
  buildInProgress: () => new AppError(ErrorMessages.PORT_009, HttpStatusCode.CONFLICT, ErrorCode.PORT_009),
  /** `details.emptySections` = mục đang bật nhưng chưa có nội dung; `details.hint` gợi ý việc cần làm để client chỉ đúng chỗ. */
  emptyPortfolio: (details: { emptySections: string[]; visibleSections: string[] }) =>
    new AppError(ErrorMessages.PORT_010, HttpStatusCode.BAD_REQUEST, ErrorCode.PORT_010, details),
  notPublished: () => new AppError(ErrorMessages.PORT_011, HttpStatusCode.CONFLICT, ErrorCode.PORT_011),
  notTakenDown: () => new AppError(ErrorMessages.PORT_012, HttpStatusCode.CONFLICT, ErrorCode.PORT_012),
  notFound: (message = "Không tìm thấy hồ sơ portfolio") => new NotFoundError(message),
  projectNotFound: () => new NotFoundError("Dự án không còn trong hồ sơ"),
};
