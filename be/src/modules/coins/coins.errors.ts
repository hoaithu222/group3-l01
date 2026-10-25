import { AppError, ConflictError, NotFoundError, VersionConflictError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/**
 * Mã lỗi `COIN_*` (p7-02 be.md §8) — factory để service dùng chung thông điệp/HTTP. COIN_006..008 dành cho chợ tài liệu (P1), chưa cấp phát.
 * `details` chỉ chứa SỐ (số dư/xu cần/tiến độ) của CHÍNH người gọi — app hiện "còn thiếu N xu".
 */
export const coinErrors = {
  insufficient: (balance: number, required: number) => make(ErrorCode.COIN_001, 400, { balance, required }),
  alreadyOwned: () => make(ErrorCode.COIN_002, 409),
  itemUnavailable: () => make(ErrorCode.COIN_003, 404),
  questAlreadyClaimed: () => make(ErrorCode.COIN_004, 409),
  questNotCompleted: (progress: number, target: number) => make(ErrorCode.COIN_005, 400, { progress, target }),
  balanceLimit: (max: number) => make(ErrorCode.COIN_009, 400, { max }),
  /** 404 chung (RES_001) cho id không tồn tại/không thuộc người gọi — không phân biệt để không dò được id của người khác. */
  notFound: (what: string) => new NotFoundError(what),

  // ── chợ tài liệu (P1) ──
  /** Nội dung không thể niêm yết (không sở hữu/không PUBLIC/không đúng loại) HOẶC không thể mua (tự mua tin của mình). */
  contentNotEligible: () => make(ErrorCode.COIN_006, 400),
  listingLimitReached: (max: number) => make(ErrorCode.COIN_007, 409, { max }),
  marketplaceDisabled: () => make(ErrorCode.COIN_008, 403),
  /** Nội dung đã có tin niêm yết khác (unique `[contentType, contentId]`) — không phải mã COIN_* (RES_002 chung). */
  alreadyListed: () => new ConflictError("Nội dung này đã có tin niêm yết khác"),
  /** Tin đang không ở trạng thái phù hợp cho hành động vừa gọi (sửa/duyệt/ẩn/khôi phục) — RES_002 chung, thông điệp theo NGỮ CẢNH. */
  wrongListingStatus: (message: string) => new ConflictError(message),
  listingVersionConflict: (currentVersion: number) => new VersionConflictError(currentVersion),
} as const;
