import { AppError, ScopeNotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";

/** Một lỗi của một mục khi lưu hàng loạt (`STUDY_001.details[]`) — `index` là vị trí trong `upsert[]` (0-based). */
export interface StudyItemErrorDetail {
  index: number;
  clientItemKey: string | null;
  /** Đường dẫn trường lỗi, vd `correctOptionIndex`, `options.2.text`, `frontMediaAssetId`. */
  field: string;
  /** REQUIRED | TOO_LONG | TOO_SHORT | TOO_MANY | TOO_FEW | INVALID_TYPE | INVALID_FORMAT | DUPLICATE_KEY | NOT_FOUND | STUDY_005 | STUDY_006 … */
  code: string;
}

/** Mã lỗi `STUDY_*` (p4-01 be.md §8) — factory để service dùng chung một thông điệp/HTTP. */
export const studyErrors = {
  invalidItems: (details: StudyItemErrorDetail[]) => new AppError(ErrorMessages[ErrorCode.STUDY_001], 400, ErrorCode.STUDY_001, details),
  itemLimit: (max: number) => new AppError(ErrorMessages[ErrorCode.STUDY_002], 409, ErrorCode.STUDY_002, { max }),
  workspaceRequired: (reason?: string) =>
    new AppError(ErrorMessages[ErrorCode.STUDY_003], 400, ErrorCode.STUDY_003, reason ? { field: "workspaceId", reason } : undefined),
  hidden: () => new AppError(ErrorMessages[ErrorCode.STUDY_004], 409, ErrorCode.STUDY_004),
  setLimit: (max: number) => new AppError(ErrorMessages[ErrorCode.STUDY_007], 409, ErrorCode.STUDY_007, { max }),
  confirmPublic: () => new AppError(ErrorMessages[ErrorCode.STUDY_008], 400, ErrorCode.STUDY_008),
  /** 404 trung tính — không phân biệt "không có" / "đã xoá" / "không được thấy" (02-conventions §2). */
  notFound: () => new ScopeNotFoundError(),
} as const;

/** Mã lỗi `MOCK_*` (p4-02 be.md §8) — thi thử. */
export const mockErrors = {
  noQuestions: () => new AppError(ErrorMessages[ErrorCode.MOCK_001], 409, ErrorCode.MOCK_001),
  /** Kèm `attemptId` để app đề nghị "Tiếp tục bài đang làm". */
  activeExists: (attemptId: string | null) => new AppError(ErrorMessages[ErrorCode.MOCK_002], 409, ErrorCode.MOCK_002, { attemptId }),
  timeUp: () => new AppError(ErrorMessages[ErrorCode.MOCK_003], 409, ErrorCode.MOCK_003),
  alreadySubmitted: () => new AppError(ErrorMessages[ErrorCode.MOCK_004], 409, ErrorCode.MOCK_004),
  notInExam: (details?: unknown) => new AppError(ErrorMessages[ErrorCode.MOCK_005], 400, ErrorCode.MOCK_005, details),
  dailyLimit: (max: number) => new AppError(ErrorMessages[ErrorCode.MOCK_006], 429, ErrorCode.MOCK_006, { max }),
} as const;

/** Mã lỗi `SR_*` (p4-02 be.md §8) — ôn tập ngắt quãng. */
export const srErrors = {
  suspended: () => new AppError(ErrorMessages[ErrorCode.SR_001], 409, ErrorCode.SR_001),
  noItems: () => new AppError(ErrorMessages[ErrorCode.SR_002], 409, ErrorCode.SR_002),
  dailyLimit: (max: number) => new AppError(ErrorMessages[ErrorCode.SR_003], 429, ErrorCode.SR_003, { max }),
} as const;
