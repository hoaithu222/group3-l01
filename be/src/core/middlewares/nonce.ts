import type { Request, Response, NextFunction } from "express";
import { NonceUtils } from "../utils/nonce";
import { UnauthorizedError } from "../exceptions";
import { ErrorCode } from "../utils/error.codes";

const NONCE_INVALID_MESSAGE = "Mã nonce không hợp lệ hoặc đã hết hạn, vui lòng lấy mã mới";

/**
 * Middleware chống replay: tiêu thụ `req.body[fieldName]` (mặc định `nonce`)
 * qua `NonceUtils.consume()`. Không hợp lệ (chưa từng cấp / đã dùng / hết
 * hạn) → CÙNG một lỗi `AUTH_018` — cố tình không phân biệt 3 trường hợp để
 * không lộ cho kẻ tấn công biết nonce có tồn tại hay không.
 *
 * Chạy SAU validate body (đảm bảo field đã đúng định dạng) và TRƯỚC mọi so
 * sánh mật khẩu/bí mật — tiêu thụ nonce trước khi biết request có hợp lệ hay
 * không, để 1 nonce không thể bị thử lại nhiều lần dù sai mật khẩu.
 */
export function requireNonce(fieldName = "nonce") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const nonce = (req.body as Record<string, unknown> | undefined)?.[fieldName];
    if (typeof nonce !== "string" || !nonce) {
      next(new UnauthorizedError(NONCE_INVALID_MESSAGE, ErrorCode.AUTH_018));
      return;
    }
    const ok = await NonceUtils.consume(nonce);
    if (!ok) {
      next(new UnauthorizedError(NONCE_INVALID_MESSAGE, ErrorCode.AUTH_018));
      return;
    }
    next();
  };
}
