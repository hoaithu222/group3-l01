import { AppError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";

/** Mã lỗi `RSC_*` (p3-01 be.md §8) — factory để repository/service dùng chung một thông điệp/HTTP. */
export const rscErrors = {
  depthExceeded: (max: number) => new AppError(ErrorMessages[ErrorCode.RSC_001], 400, ErrorCode.RSC_001, { max }),
  folderNameTaken: () => new AppError(ErrorMessages[ErrorCode.RSC_002], 409, ErrorCode.RSC_002),
  assetNotAttachable: () => new AppError(ErrorMessages[ErrorCode.RSC_003], 400, ErrorCode.RSC_003),
  folderNotEmpty: () => new AppError(ErrorMessages[ErrorCode.RSC_004], 409, ErrorCode.RSC_004),
  noPreview: (convertible: boolean) =>
    new AppError(ErrorMessages[ErrorCode.RSC_005], 409, ErrorCode.RSC_005, { convertible }),
  moveIntoSelf: () => new AppError(ErrorMessages[ErrorCode.RSC_006], 400, ErrorCode.RSC_006),
  quotaExceeded: (quotaBytes: number, usedBytes: number) =>
    new AppError(ErrorMessages[ErrorCode.RSC_007], 413, ErrorCode.RSC_007, { quotaBytes, usedBytes }),
  restoreTargetGone: () => new AppError(ErrorMessages[ErrorCode.RSC_008], 409, ErrorCode.RSC_008),
} as const;

/** Tác nhân hệ thống (job purge) — `AuditLog.actorId` là ObjectId nên dùng id "không" hợp lệ. */
export const SYSTEM_ACTOR_ID = "000000000000000000000000";
