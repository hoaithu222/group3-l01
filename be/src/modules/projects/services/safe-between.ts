import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { between } from "./task-position";

/**
 * `between` ném lỗi khi hàng xóm có khoá sai định dạng hoặc trùng nhau (dữ liệu hỏng — không xảy ra ở luồng bình
 * thường). Tự chữa: xếp job `board.rebalance-column` (sinh lại khoá hợp lệ, duy nhất cho cả cột) rồi trả
 * `503 SYS_503 { retryable, reason }` để client thử lại sau vài giây, thay vì 500 thô.
 */
export function betweenOrRepair(a: string | null, b: string | null, repair: () => void): string {
  try {
    return between(a, b);
  } catch {
    repair();
    throw new AppError(ErrorMessages[ErrorCode.SYS_503], 503, ErrorCode.SYS_503, {
      retryable: true,
      reason: "POSITION_KEY_INVALID",
    });
  }
}
