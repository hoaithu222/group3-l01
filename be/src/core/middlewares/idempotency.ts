import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { redis } from "../../infrastructure/redis";
import { IdempotencyInProgressError, ValidationError } from "../exceptions";

const keySchema = z.string().min(8).max(128);
const TTL = 24 * 3600;

interface Stored {
  status: number;
  body: unknown;
}

/**
 * Idempotency theo (userId, scope, key). Key từ header `Idempotency-Key` hoặc `body[bodyField]`.
 * Lần đầu: đặt PENDING, chạy handler, lưu response (trừ 5xx/429 — lỗi tạm thời, nhả khoá). Lần sau: trả lại response cũ.
 */
export function idempotencyKey(
  scope: string,
  opts: { bodyField?: string; required?: boolean } = {}
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const raw = (req.header("Idempotency-Key") ??
      (opts.bodyField ? (req.body as Record<string, unknown>)?.[opts.bodyField] : undefined)) as
      string | undefined;
    if (!raw) return opts.required ? next(new ValidationError("Thiếu Idempotency-Key")) : next();
    const parsed = keySchema.safeParse(raw);
    if (!parsed.success) return next(new ValidationError("Idempotency-Key không hợp lệ"));
    const userId = req.user?.id ?? "anon";
    const key = `idem:${userId}:${scope}:${parsed.data}`;

    const existing = await redis.get<Stored | "PENDING">(key);
    if (existing === "PENDING") return next(new IdempotencyInProgressError());
    if (existing && typeof existing === "object") {
      res.setHeader("Idempotent-Replayed", "true");
      res.status(existing.status).json(existing.body);
      return;
    }
    await redis.set(key, "PENDING", 60);

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const status = res.statusCode;
      // 5xx và 429 là lỗi TẠM THỜI ("thử lại sau") nên KHÔNG lưu: nhả khoá để cùng `Idempotency-Key` gửi lại được ngay khi có
      // chỗ. Lưu 429 nghĩa là lượt bị `scopeLimiter` (đặt SAU middleware này) chặn sẽ bị phát lại nguyên văn suốt 24 giờ dù
      // hạn mức đã thông. Các 4xx còn lại là kết luận về CHÍNH yêu cầu này (sai dữ liệu, xung đột…) nên vẫn được lưu.
      const cacheable = status < 500 && status !== 429;
      void redis.set(key, cacheable ? { status, body } : "", cacheable ? TTL : 1);
      return originalJson(body);
    }) as Response["json"];
    next();
  };
}
