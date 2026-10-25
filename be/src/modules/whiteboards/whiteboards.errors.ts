import { AppError, ScopeNotFoundError, VersionConflictError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/**
 * Mã lỗi `WB_*` (p6-02 be.md §8) — factory để service dùng chung thông điệp/HTTP. `WB_008` (409) ngoài bảng kế hoạch: collab dựa vào 409 của PUT state để biết
 * "đã lưu trữ → bỏ state chưa lưu, đóng kết nối soạn" (còn 403 sẽ bị coi là lỗi tạm và thử lại vô hạn) — tương ứng `DOC_008` của tài liệu.
 * Dịch vụ collab chưa cấu hình dùng lại `DOC_009` do `CollabTokenService` (dùng chung hai loại) ném.
 */
export const whiteboardErrors = {
  tooManyWhiteboards: (max: number) => make(ErrorCode.WB_001, 409, { max }),
  invalidThumbnail: () => make(ErrorCode.WB_002, 400),
  collaboratorsNotInWorkspace: (invalidUserIds: string[]) => make(ErrorCode.WB_003, 400, { invalidUserIds }),
  tooManyCollaborators: (max: number) => make(ErrorCode.WB_004, 409, { max }),
  archived: () => make(ErrorCode.WB_005, 403),
  tooManySnapshots: (max: number) => make(ErrorCode.WB_006, 409, { max }),
  /** `details` báo trần đã vi phạm để collab/app hiện đúng ("Bảng đầy" hay "Bảng quá lớn"). */
  tooLarge: (details: { maxBytes: number; maxElements: number; elementCount?: number }) => make(ErrorCode.WB_007, 413, details),
  cannotStoreArchived: () => make(ErrorCode.WB_008, 409),
  /** 404 trung tính — không phân biệt "không có" / "không được thấy" (02-conventions §2). */
  notFound: () => new ScopeNotFoundError(),
  /** `expectedVersion` lệch → 409 `RES_003` + `details.current`. */
  versionConflict: (current: number) => new VersionConflictError(current),
} as const;
