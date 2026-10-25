/**
 * @file internal-auth.ts
 * @description Xác thực lời gọi NỘI BỘ giữa các service của hệ thống (không phải người dùng) bằng bí mật dùng chung ở header —
 * hiện chỉ service `collab/` (p6-01): `X-Collab-Secret: <COLLAB_SHARED_SECRET>`. Route dùng middleware này KHÔNG qua `authenticateToken`
 * (không có người dùng) và chỉ được mở trong mạng nội bộ (nginx không proxy `/api/internal/*` ra Internet).
 *
 * Fail-CLOSED: chưa cấu hình bí mật → 503 `SYS_503` (không bao giờ cho qua); sai/thiếu → 401 `AUTH_002`. So sánh thời gian hằng
 * (băm SHA-256 về cùng độ dài rồi `timingSafeEqual`) nên không lộ độ dài/tiền tố đúng của bí mật.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../config";
import { AppError, UnauthorizedError } from "../exceptions";
import { ErrorCode, ErrorMessages } from "../utils/error.codes";

export type InternalService = "collab";

interface InternalServiceSpec {
  header: string;
  secret: () => string | undefined;
}

const SERVICES: Record<InternalService, InternalServiceSpec> = {
  collab: { header: "x-collab-secret", secret: () => env.COLLAB_SHARED_SECRET },
};

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** So bí mật ở thời gian hằng. Dùng chung cho test/BE → collab (`shared/collab`). */
export function internalSecretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

/** Chặn route nội bộ của `service` — xem ghi chú đầu file. */
export function requireInternalSecret(service: InternalService): RequestHandler {
  const spec = SERVICES[service];
  return (req: Request, _res: Response, next: NextFunction): void => {
    const expected = spec.secret();
    if (!expected) {
      next(new AppError(ErrorMessages[ErrorCode.SYS_503], 503, ErrorCode.SYS_503));
      return;
    }
    const provided = req.header(spec.header);
    if (!internalSecretMatches(provided, expected)) {
      next(new UnauthorizedError("Thiếu hoặc sai bí mật nội bộ", ErrorCode.AUTH_002));
      return;
    }
    next();
  };
}
