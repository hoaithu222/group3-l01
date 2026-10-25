import { MemoryStore, type ClientRateLimitInfo, type IncrementResponse, type Options, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import { env } from "../config";

/** Ít nhất chừng này ms giữa hai dòng log cảnh báo "Redis không dùng được" (tránh ngập log khi Redis sập). */
const WARN_THROTTLE_MS = 30_000;

/**
 * Redis "sẵn sàng" = đã bắt tay xong. `client.isOpen` KHÔNG đủ: nó thành `true` ngay khi gọi
 * `.connect()` và không bao giờ quay lại `false` khi đang tự retry nền — gửi lệnh trên client như vậy treo
 * vô thời hạn. Chỉ `isReady` toggle đúng khi mất/nối lại kết nối.
 */
function redisReady(): boolean {
  try {
    return redis.getClient()?.isReady === true;
  } catch {
    return false;
  }
}

/** `RedisStore` (rate-limit-redis) gửi lệnh thô qua client node-redis đã kết nối; chưa sẵn sàng ⇒ reject (KHÔNG throw đồng bộ). */
function makeRedisStore(prefix: string): RedisStore {
  const store = new RedisStore({
    prefix: `${env.REDIS_KEY_PREFIX}${prefix}`,
    sendCommand: (...args: string[]) => {
      try {
        const client = redis.getClient();
        if (!client?.isReady) {
          return Promise.reject(new Error("[rateLimiter] Redis client chưa sẵn sàng"));
        }
        return client.sendCommand(args);
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
  // `RedisStore` nạp 2 Lua script NGAY trong constructor (không lazy) và lưu promise vào field public. Nếu Redis
  // chưa sẵn sàng lúc khởi động, promise này reject khi chưa ai gắn handler ⇒ Node coi là "unhandled rejection".
  // Gắn no-op catch: `retryableIncrement` tự nạp lại script ở request thật đầu tiên có Redis.
  store.incrementScriptSha.catch(() => undefined);
  store.getScriptSha.catch(() => undefined);
  return store;
}

/**
 * Store cho `express-rate-limit`: Redis là đường CHÍNH (bộ đếm dùng chung mọi instance — SEC-06: 700 request/60 s
 * chia đều 2 instance vẫn bị chặn ở request thứ 601), còn khi Redis chưa sẵn sàng hoặc lệnh lỗi thì rơi về
 * `MemoryStore` trong tiến trình (đếm riêng từng instance) thay vì bỏ trống giới hạn.
 *
 * - Dev/test không cần Redis: giới hạn chạy bằng bộ nhớ, không log ồn.
 * - Production mất Redis: chế độ suy giảm (mỗi instance tự đếm) + cảnh báo có giới hạn tần suất — vẫn chặn được
 *   brute-force theo IP, chỉ mất tính "toàn cụm".
 * - Bộ nhớ dự phòng tự dọn (`MemoryStore` có timer `unref()` theo `windowMs`), không rò rỉ.
 */
export class ResilientRateLimitStore implements Store {
  readonly localKeys = false;
  private readonly memory = new MemoryStore();
  private lastWarnAt = 0;

  constructor(
    private readonly redisStore: RedisStore,
    private readonly label: string
  ) {}

  init(options: Options): void {
    this.redisStore.init(options);
    this.memory.init(options);
  }

  async increment(key: string): Promise<IncrementResponse> {
    if (redisReady()) {
      try {
        return await this.redisStore.increment(key);
      } catch (err) {
        this.warnDegraded("increment", err);
      }
    } else {
      this.warnDegraded("increment");
    }
    return this.memory.increment(key);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    if (redisReady()) {
      try {
        return await this.redisStore.get(key);
      } catch (err) {
        this.warnDegraded("get", err);
      }
    }
    return this.memory.get(key);
  }

  async decrement(key: string): Promise<void> {
    if (redisReady()) {
      try {
        await this.redisStore.decrement(key);
        return;
      } catch (err) {
        this.warnDegraded("decrement", err);
      }
    }
    await this.memory.decrement(key);
  }

  async resetKey(key: string): Promise<void> {
    await this.memory.resetKey(key);
    if (!redisReady()) return;
    try {
      await this.redisStore.resetKey(key);
    } catch (err) {
      this.warnDegraded("resetKey", err);
    }
  }

  /** Chỉ dùng trong test — tắt timer dọn dẹp của `MemoryStore`. */
  shutdown(): void {
    this.memory.shutdown();
  }

  private warnDegraded(op: string, err?: unknown): void {
    if (env.NODE_ENV !== "production") return; // dev/test: bộ nhớ là đường bình thường, không ồn log
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_THROTTLE_MS) return;
    this.lastWarnAt = now;
    logger.warn(
      `[rateLimiter:${this.label}] Redis không dùng được khi ${op} — giới hạn tốc độ chạy chế độ suy giảm (bộ nhớ từng instance)`,
      err instanceof Error ? { error: err.message } : undefined
    );
  }
}

/** Store cho 1 limiter: khoá Redis `<REDIS_KEY_PREFIX><prefix><ip|user>`. */
export function makeRateLimitStore(prefix: string): ResilientRateLimitStore {
  return new ResilientRateLimitStore(makeRedisStore(prefix), prefix);
}
