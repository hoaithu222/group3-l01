import { v4 as uuidv4 } from "uuid";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware gắn X-Request-ID duy nhất vào mỗi request.
 * - Sinh UUID v4 nếu header chưa có.
 * - Gán vào `req.requestId` để dùng trong controller / logger.
 * - Trả về header `X-Request-ID` trong response.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId =
    (req.headers["x-request-id"] as string | undefined) ?? uuidv4();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}
