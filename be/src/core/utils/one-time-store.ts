import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import { env } from "../config";
import { AppError } from "../exceptions";
import { ErrorCode } from "./error.codes";

/** Chu kỳ dọn mục hết hạn của Map dự phòng (dev). */
const SWEEP_INTERVAL_MS = 30_000;
/** Trần số mục của Map dự phòng — chống rò bộ nhớ khi có kẻ spam cấp mã ở dev. */
const DEFAULT_MAX_MEMORY_ENTRIES = 10_000;
/** Ít nhất chừng này ms giữa hai dòng log cảnh báo "Redis không sẵn sàng" (tránh ngập log khi Redis sập). */
const WARN_THROTTLE_MS = 30_000;

export interface OneTimeStoreOptions {
  /** Tiền tố khoá Redis, vd `nonce:` (wrapper `redis` tự thêm `REDIS_KEY_PREFIX` phía trước). */
  prefix: string;
  ttlSeconds: number;
  /** Nhãn hiện trong log, vd `nonce`. */
  label: string;
  maxMemoryEntries?: number;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/** Redis "sẵn sàng" = đã bắt tay xong. `client.isOpen` không đủ (xem ghi chú trong `redis.client.ts`). */
function redisReady(): boolean {
  try {
    return redis.getClient()?.isReady === true;
  } catch {
    return false;
  }
}

function isProduction(): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Kho "dùng một lần" cho mã có TTL ngắn (nonce chống replay, token đặt lại mật
 * khẩu…): `put` ghi mã, `take` lấy ra VÀ xoá trong một thao tác nguyên tử.
 *
 * - Đường CHÍNH: Redis — `SET key EX ttl` + `GETDEL` nguyên tử, dùng chung mọi
 *   instance API (hai request đồng thời không thể cùng lấy một mã).
 * - Dự phòng (CHỈ khi Redis chưa sẵn sàng/lỗi VÀ `NODE_ENV !== "production"`):
 *   `Map` trong tiến trình để auth ở dev không phụ thuộc Redis. Mục hết hạn
 *   được dọn định kỳ (timer `unref()`, tự tắt khi Map rỗng) và Map có trần.
 * - Production mà Redis không dùng được: KHÔNG mở cửa — `put` ném 503
 *   `SYS_503`, `take` trả `null` (kèm log cảnh báo). Không bao giờ chạm Map.
 */
export class OneTimeStore {
  private readonly memory = new Map<string, MemoryEntry>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private lastWarnAt = 0;

  constructor(private readonly options: OneTimeStoreOptions) {}

  private key(id: string): string {
    return `${this.options.prefix}${id}`;
  }

  /**
   * Có nơi lưu dùng được không? `true` khi Redis sẵn sàng, hoặc không phải
   * production (có Map dự phòng). Cho phép nơi gọi từ chối SỚM, đồng nhất với
   * mọi đầu vào (vd `forgot-password` không được để lộ email nào tồn tại qua
   * việc chỉ email có thật mới gặp 503).
   */
  available(): boolean {
    return redisReady() || !isProduction();
  }

  /**
   * Ghi `id` (kèm `value`, mặc định "1") với TTL. Ném `AppError` 503
   * `SYS_503` khi không có nơi lưu an toàn (production + Redis không dùng được).
   */
  async put(id: string, value: string | object = "1"): Promise<void> {
    if (redisReady()) {
      try {
        await redis.set(this.key(id), value, this.options.ttlSeconds);
        return;
      } catch (err) {
        this.warnUnavailable("put", err);
      }
    } else {
      this.warnUnavailable("put");
    }

    if (isProduction()) {
      throw new AppError(
        "Dịch vụ tạm thời không khả dụng, vui lòng thử lại sau",
        503,
        ErrorCode.SYS_503
      );
    }
    this.memoryPut(id, typeof value === "string" ? value : JSON.stringify(value));
  }

  /**
   * Lấy `id` ra khỏi kho — trả giá trị đã lưu đúng MỘT lần, `null` nếu chưa
   * từng ghi / đã lấy / hết hạn / kho không dùng được ở production.
   */
  async take<T = string>(id: string): Promise<T | null> {
    if (redisReady()) {
      try {
        const value = await redis.getdel<T>(this.key(id));
        if (value !== null && value !== undefined) return value;
        // Không thấy trên Redis: ở dev có thể mã được ghi lúc Redis còn chưa
        // sẵn sàng (Map dự phòng) — tra tiếp. Production không có Map nên bỏ qua.
        return isProduction() ? null : this.memoryTake<T>(id);
      } catch (err) {
        this.warnUnavailable("take", err);
      }
    } else {
      this.warnUnavailable("take");
    }
    return isProduction() ? null : this.memoryTake<T>(id);
  }

  /** Xoá `id` (best-effort, không ném lỗi). */
  async remove(id: string): Promise<void> {
    this.memory.delete(id);
    if (!redisReady()) return;
    try {
      await redis.del(this.key(id));
    } catch (err) {
      logger.warn(`[OneTimeStore:${this.options.label}] Không xoá được mã trên Redis:`, err);
    }
  }

  /** Chỉ dùng trong test — xoá Map dự phòng và tắt timer dọn dẹp. */
  resetMemoryForTests(): void {
    this.memory.clear();
    this.stopSweeper();
    this.lastWarnAt = 0;
  }

  /** Chỉ dùng trong test — số mục còn trong Map dự phòng. */
  memorySizeForTests(): number {
    return this.memory.size;
  }

  // ── Map dự phòng (chỉ non-production) ──────────────────────────────────────

  private memoryPut(id: string, value: string): void {
    const max = this.options.maxMemoryEntries ?? DEFAULT_MAX_MEMORY_ENTRIES;
    if (this.memory.size >= max) {
      this.sweep();
      // Vẫn đầy sau khi dọn hết mục hết hạn: đẩy mục CŨ NHẤT (Map giữ thứ tự chèn).
      while (this.memory.size >= max) {
        const oldest = this.memory.keys().next();
        if (oldest.done) break;
        this.memory.delete(oldest.value);
      }
    }
    this.memory.set(id, { value, expiresAt: Date.now() + this.options.ttlSeconds * 1000 });
    this.startSweeper();
  }

  private memoryTake<T>(id: string): T | null {
    const entry = this.memory.get(id);
    if (!entry) return null;
    this.memory.delete(id);
    if (entry.expiresAt <= Date.now()) return null;
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }

  /** Xoá mọi mục đã hết hạn; tắt timer khi Map rỗng. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.memory) {
      if (entry.expiresAt <= now) this.memory.delete(id);
    }
    if (this.memory.size === 0) this.stopSweeper();
  }

  private startSweeper(): void {
    if (this.sweepTimer) return;
    // `unref()` — timer dọn dẹp không được giữ tiến trình (hay Jest) sống.
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  private stopSweeper(): void {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  private warnUnavailable(op: "put" | "take", err?: unknown): void {
    if (!isProduction()) return; // dev: dùng Map dự phòng là bình thường, không ồn log
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_THROTTLE_MS) return;
    this.lastWarnAt = now;
    logger.warn(
      `[OneTimeStore:${this.options.label}] Redis không sẵn sàng khi ${op} — production KHÔNG dùng bộ nhớ dự phòng, từ chối thao tác`,
      err instanceof Error ? { error: err.message } : undefined
    );
  }
}
