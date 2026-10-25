import { AppError, ScopeNotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/** Mã lỗi `O2O_*` (p6-05 be.md §8) — factory để service dùng chung thông điệp/HTTP. */
export const o2oErrors = {
  shopNotAccepting: () => make(ErrorCode.O2O_001, 409),
  unsupportedSettings: (field: string) => make(ErrorCode.O2O_002, 400, { field }),
  invalidFile: (reason?: string) => make(ErrorCode.O2O_003, 400, reason ? { reason } : undefined),
  invalidState: (status: string) => make(ErrorCode.O2O_004, 409, { status }),
  noQuote: () => make(ErrorCode.O2O_005, 409),
  fileNotAvailable: () => make(ErrorCode.O2O_006, 403),
  wrongPin: (attemptsLeft: number) => make(ErrorCode.O2O_007, 400, { attemptsLeft }),
  pinLocked: (retryAfterSeconds: number) => make(ErrorCode.O2O_008, 423, { retryAfterSeconds }),
  ownerNotFound: () => make(ErrorCode.O2O_009, 400, { field: "ownerEmail" }),
  locationHidden: () => make(ErrorCode.O2O_010, 404),
  tooManyPages: (max: number) => make(ErrorCode.O2O_011, 400, { max }),
  invalidPageRange: () => make(ErrorCode.O2O_012, 400, { field: "pageRange" }),
  shopLocationConflict: () => make(ErrorCode.O2O_013, 409, { field: "locationId" }),
  versionConflict: (currentVersion?: number) =>
    new AppError(ErrorMessages[ErrorCode.RES_003], 409, ErrorCode.RES_003, currentVersion !== undefined ? { currentVersion } : undefined),
  /** 404 trung tính — không phân biệt "không có" / "không phải của bạn" (IR-13). */
  notFound: () => new ScopeNotFoundError(),
} as const;
