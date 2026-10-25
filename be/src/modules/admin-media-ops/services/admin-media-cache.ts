import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";

/** Cache JSON ngắn hạn cho số liệu tổng hợp (thống kê 5 phút, health 15 s, KPI 60 s) — Redis lỗi thì bỏ qua cache (tính lại), không làm hỏng yêu cầu. */
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: object, ttlSeconds: number): Promise<void>;
}

export class RedisCache implements CachePort {
  async get<T>(key: string): Promise<T | null> {
    try {
      const v = await redis.get<T>(key);
      return v !== null && typeof v === "object" ? v : null;
    } catch (err) {
      logger.warn("[admin-media] Không đọc được cache", { key, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async set(key: string, value: object, ttlSeconds: number): Promise<void> {
    try {
      await redis.set(key, value, ttlSeconds);
    } catch (err) {
      logger.warn("[admin-media] Không ghi được cache", { key, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Cache trong bộ nhớ có hạn — cho test và làm điểm tựa khi cần chạy không Redis. */
export class MemoryCache implements CachePort {
  private readonly items = new Map<string, { at: number; ttlMs: number; value: object }>();
  constructor(private readonly now: () => number = Date.now) {}

  get<T>(key: string): Promise<T | null> {
    const hit = this.items.get(key);
    if (!hit || this.now() - hit.at >= hit.ttlMs) return Promise.resolve(null);
    return Promise.resolve(hit.value as T);
  }

  set(key: string, value: object, ttlSeconds: number): Promise<void> {
    this.items.set(key, { at: this.now(), ttlMs: ttlSeconds * 1000, value });
    return Promise.resolve();
  }
}
