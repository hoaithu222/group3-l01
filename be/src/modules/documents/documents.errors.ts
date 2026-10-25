import { AppError, ScopeNotFoundError, VersionConflictError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/** Mã lỗi `DOC_*` (p6-01 be.md §8) — factory để service dùng chung thông điệp/HTTP. */
export const documentErrors = {
  tooManyDocuments: (max: number) => make(ErrorCode.DOC_001, 409, { max }),
  confirmPublicRequired: () => make(ErrorCode.DOC_002, 400),
  collaboratorsNotInWorkspace: (invalidUserIds: string[]) => make(ErrorCode.DOC_003, 400, { invalidUserIds }),
  tooManyCollaborators: (max: number) => make(ErrorCode.DOC_004, 409, { max }),
  archived: () => make(ErrorCode.DOC_005, 403),
  tooLarge: (max: number) => make(ErrorCode.DOC_006, 413, { maxBytes: max }),
  tooManySnapshots: (max: number) => make(ErrorCode.DOC_007, 409, { max }),
  cannotStoreArchived: () => make(ErrorCode.DOC_008, 409),
  collabUnavailable: () => make(ErrorCode.DOC_009, 503),
  /** 404 trung tính — không phân biệt "không có" / "không được thấy" (02-conventions §2). */
  notFound: () => new ScopeNotFoundError(),
  /** `expectedVersion` lệch → 409 `RES_003` + `details.current`. */
  versionConflict: (current: number) => new VersionConflictError(current),
} as const;
