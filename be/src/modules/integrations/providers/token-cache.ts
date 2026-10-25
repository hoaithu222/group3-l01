import { decryptSecret, encryptSecret, isSealedSecret } from "../../../core/utils/crypto";
import { redis } from "../../../infrastructure/redis";

/**
 * Bộ nhớ đệm token ngắn hạn (installation token GitHub, cache 50 phút — không lưu DB). Giá trị luôn được MÃ HOÁ trước khi vào Redis
 * (không để token thô nằm ở Redis). Redis không sẵn sàng → `get` trả `null`, `set` no-op (mỗi lần sinh token mới — chậm hơn nhưng đúng).
 */
export interface ITokenCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export class RedisTokenCache implements ITokenCache {
  async get(key: string): Promise<string | null> {
    try {
      const sealed = await redis.get<unknown>(`int:tok:${key}`);
      return isSealedSecret(sealed) ? decryptSecret(sealed) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await redis.set(`int:tok:${key}`, encryptSecret(value), ttlSeconds);
    } catch {
      // cache là tối ưu — lỗi Redis không được làm hỏng luồng chính
    }
  }
}

/** Cache trong bộ nhớ (test/dev khi không có Redis). */
export class MemoryTokenCache implements ITokenCache {
  private readonly map = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): Promise<string | null> {
    const hit = this.map.get(key);
    if (!hit || hit.expiresAt <= this.now()) return Promise.resolve(null);
    return Promise.resolve(hit.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }
}
