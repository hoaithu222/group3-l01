import { createHash } from "crypto";
import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import { AppError } from "../exceptions";
import { ErrorCode } from "../utils/error.codes";
import { LIMITS } from "../constants/limits";

export interface AttemptGuardOptions {
  /** Số lần sai tối đa trong cửa sổ trước khi khoá. */
  maxFailures: number;
  /** Cửa sổ đếm (giây) — đếm lại từ 0 sau khoảng này nếu chưa tới ngưỡng. */
  windowSeconds: number;
  /** Thời gian khoá (giây) khi chạm ngưỡng. */
  lockSeconds: number;
}

export interface FailureResult {
  /** `true` khi CHÍNH lần sai này vừa chạm ngưỡng và bắt đầu khoá. */
  justLocked: boolean;
  /** Số giây còn lại của khoá (0 nếu chưa khoá). */
  retryAfterSeconds: number;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Đếm lần nhập SAI mật khẩu (hoặc mã xác minh) theo TÀI KHOẢN, khoá tạm khi
 * vượt ngưỡng — lớp bảo vệ bổ sung cho `authLimiter` (theo IP): kẻ tấn công
 * xoay IP vẫn không dò được mật khẩu của một tài khoản.
 *
 * - `scope` tách các luồng (`login`, `reauth`, `verify-email`) để một luồng bị
 *   dò không khoá luồng khác.
 * - `id` (email đã chuẩn hoá / userId) được băm trước khi vào khoá Redis —
 *   không lưu email thô. Đếm cả khi email KHÔNG tồn tại ⇒ hành vi khoá y hệt
 *   nhau, không lộ "email có đăng ký hay không".
 * - Chỉ đếm lần SAI; thành công gọi `reset()` xoá cả bộ đếm lẫn khoá.
 * - Redis không sẵn sàng ⇒ KHÔNG chặn (fail-open, log cảnh báo): sự cố hạ
 *   tầng không được khoá người dùng thật; `authLimiter` theo IP vẫn còn.
 */
export class PasswordAttemptGuard {
  private readonly opts: AttemptGuardOptions;

  constructor(
    private readonly scope: string,
    opts: Partial<AttemptGuardOptions> = {}
  ) {
    this.opts = {
      maxFailures: opts.maxFailures ?? LIMITS.auth.passwordAttempts.failedAttemptsMax,
      windowSeconds: opts.windowSeconds ?? LIMITS.auth.passwordAttempts.windowSeconds,
      lockSeconds: opts.lockSeconds ?? LIMITS.auth.passwordAttempts.lockSeconds,
    };
  }

  private counterKey(id: string): string {
    return `auth:attempts:${this.scope}:${digest(id)}`;
  }

  private lockKey(id: string): string {
    return `auth:lock:${this.scope}:${digest(id)}`;
  }

  /** Ném `AppError` 429 `RATE_002` (`details.retryAfterSeconds`) khi `id` đang bị khoá. */
  async assertNotLocked(id: string): Promise<void> {
    const remaining = await this.remainingLockSeconds(id);
    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60);
      throw new AppError(
        `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút`,
        429,
        ErrorCode.RATE_002,
        { retryAfterSeconds: remaining }
      );
    }
  }

  /** Ghi nhận 1 lần sai; chạm ngưỡng thì đặt khoá. Không bao giờ ném lỗi. */
  async recordFailure(id: string): Promise<FailureResult> {
    try {
      const key = this.counterKey(id);
      const count = await redis.incr(key);
      if (typeof count !== "number") {
        logger.warn("[PasswordAttemptGuard] Redis không sẵn sàng — bỏ qua đếm lần sai", {
          scope: this.scope,
        });
        return { justLocked: false, retryAfterSeconds: 0 };
      }
      if (count === 1) await redis.expire(key, this.opts.windowSeconds);
      if (count < this.opts.maxFailures) return { justLocked: false, retryAfterSeconds: 0 };

      const lockedUntil = Date.now() + this.opts.lockSeconds * 1000;
      await redis.set(this.lockKey(id), String(lockedUntil), this.opts.lockSeconds);
      await redis.del(key);
      return { justLocked: true, retryAfterSeconds: this.opts.lockSeconds };
    } catch (err) {
      logger.warn("[PasswordAttemptGuard] Lỗi khi ghi nhận lần sai", {
        scope: this.scope,
        error: err instanceof Error ? err.message : String(err),
      });
      return { justLocked: false, retryAfterSeconds: 0 };
    }
  }

  /** Thành công (hoặc đặt lại mật khẩu) ⇒ xoá bộ đếm và khoá. */
  async reset(id: string): Promise<void> {
    try {
      await Promise.all([redis.del(this.counterKey(id)), redis.del(this.lockKey(id))]);
    } catch (err) {
      logger.warn("[PasswordAttemptGuard] Không xoá được bộ đếm lần sai", {
        scope: this.scope,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async remainingLockSeconds(id: string): Promise<number> {
    try {
      const lockedUntil = await redis.get<number>(this.lockKey(id));
      if (typeof lockedUntil !== "number") return 0;
      return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
    } catch {
      return 0;
    }
  }
}
