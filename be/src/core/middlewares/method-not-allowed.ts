import type { NextFunction, Request, Response } from "express";
import { AppError } from "../exceptions";
import { HttpStatusCode } from "../constants/http-status";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../utils/error.codes";

/**
 * Chặn mọi phương thức HTTP ngoài `allowed` trên một nhánh route: `405` + header `Allow` + mã lỗi nghiệp vụ (mặc định `CONTRIB_001`,
 * "bảng đóng góp chỉ để xem"). Dùng cho tài nguyên CHỈ ĐỌC (p4-06): đặt SAU `authenticateToken` để người chưa đăng nhập vẫn nhận `401`, và
 * TRƯỚC mọi kiểm quyền/validate để phương thức ghi bị từ chối dứt khoát bất kể thân yêu cầu (kể cả trường lạ).
 *
 * Phương thức HEAD/OPTIONS được coi là hợp lệ khi `allowed` có `GET`/luôn có (CORS preflight do `cors()` trả lời trước khi tới đây).
 */
export function methodNotAllowed(allowed: readonly string[] = ["GET"], code: ErrorCodeType = ErrorCode.CONTRIB_001) {
  const allow = allowed.map((m) => m.toUpperCase());
  const header = allow.join(", ");
  return (req: Request, res: Response, next: NextFunction): void => {
    const method = req.method.toUpperCase();
    if (allow.includes(method) || method === "OPTIONS" || (method === "HEAD" && allow.includes("GET"))) {
      next();
      return;
    }
    res.setHeader("Allow", header);
    next(new AppError(ErrorMessages[code], HttpStatusCode.METHOD_NOT_ALLOWED, code, { allowed: allow }));
  };
}
