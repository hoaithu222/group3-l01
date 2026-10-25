import type { NextFunction, Request, Response } from "express";
import { HttpStatusCode } from "../constants/http-status";
import { AppError } from "../exceptions";
import { ErrorCode } from "../utils/error.codes";

/**
 * Trần kích thước thân yêu cầu RIÊNG một route (thấp hơn trần toàn cục `MAX_FILE_SIZE` của `express.json` ở `app.ts`, vốn phải
 * đủ lớn cho luồng tải tệp) — vd `PUT /study-sets/:id/items` ≤ 2 MB (p4-01 be.md §4). Bộ parser toàn cục đã đọc thân TRƯỚC khi
 * tới route nên đây là hàng rào nghiệp vụ (413 + mã `VAL_001`), không phải chống tràn bộ nhớ. Ưu tiên `Content-Length`; thiếu
 * (chunked) thì đo lại thân đã parse.
 */
export function bodyLimit(maxBytes: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const declared = Number(req.header("content-length"));
    const size = Number.isFinite(declared) && declared > 0 ? declared : Buffer.byteLength(JSON.stringify(req.body ?? {}));
    if (size > maxBytes) {
      next(new AppError("Nội dung yêu cầu quá lớn", HttpStatusCode.PAYLOAD_TOO_LARGE, ErrorCode.VAL_001, { maxBytes }));
      return;
    }
    next();
  };
}
