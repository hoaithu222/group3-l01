import type { Request, Response, NextFunction } from "express";
import { redis } from "../../infrastructure/redis";
import { ScopeRateLimitError } from "../exceptions";
import { ErrorCode, type ErrorCodeType } from "../utils/error.codes";

export interface ScopeLimit {
  max: number;
  windowSeconds: number;
}
type KeyFn = (req: Request) => string | null;

/**
 * Giới hạn theo khoá nghiệp vụ (user+channel…), nhiều cửa sổ cùng lúc.
 * Dùng INCR + EXPIRE (cửa sổ cố định) — đủ cho P0; đổi sang ZSET/Lua nếu cần sliding thật.
 * Redis down → cho qua (không chặn nghiệp vụ vì hạ tầng).
 */
export function scopeLimiter(
  name: string,
  keyFn: KeyFn,
  limits: ScopeLimit[],
  code: ErrorCodeType = ErrorCode.RATE_002
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const scopeKey = keyFn(req);
    if (!scopeKey) return next();
    for (const { max, windowSeconds } of limits) {
      const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `rl:${name}:${scopeKey}:${windowSeconds}:${bucket}`;
      const count = await redis.incr(key);
      if (count === null) continue; // Redis không khả dụng
      if (count === 1) await redis.expire(key, windowSeconds);
      if (count > max) {
        const retryAfter = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
        return next(new ScopeRateLimitError(retryAfter, code));
      }
    }
    next();
  };
}
