import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import { redis } from "../../../infrastructure/redis";
import { o2oErrors } from "../o2o.errors";
import type { IPinLockout } from "./o2o.deps";

const failKey = (orderId: string) => `o2o:pin:fail:${orderId}`;
const lockKey = (orderId: string) => `o2o:pin:lock:${orderId}`;

const unavailable = () => new AppError(ErrorMessages[ErrorCode.SYS_503], 503, ErrorCode.SYS_503);

/**
 * Chống dò PIN (be.md §5 "Pickup"): Redis `o2o:pin:fail:<orderId>` INCR (cửa sổ `pinLockMinutes`), tới `pinAttemptsMax` lần sai →
 * `o2o:pin:lock:<orderId>` = mốc hết khoá (ms) TTL `pinLockMinutes` ⇒ `O2O_008` (423, `retryAfterSeconds`). Đúng PIN → xoá cả hai.
 *
 * FAIL-CLOSED: Redis không sẵn sàng ⇒ 503 TRƯỚC khi so PIN (nếu vẫn so thì phản hồi "đúng/sai" cho dò không giới hạn).
 */
export class RedisPinLockout implements IPinLockout {
  constructor(
    private readonly isAvailable: () => boolean = () => redis.getClient()?.isReady === true,
    private readonly nowMs: () => number = () => Date.now()
  ) {}

  async check(orderId: string): Promise<void> {
    if (!this.isAvailable()) throw unavailable();
    const until = Number(await redis.get<number>(lockKey(orderId)));
    if (Number.isFinite(until) && until > this.nowMs()) throw o2oErrors.pinLocked(Math.ceil((until - this.nowMs()) / 1000));
  }

  async fail(orderId: string): Promise<{ attemptsLeft: number; locked: boolean; retryAfterSeconds: number }> {
    const { pinAttemptsMax, pinLockMinutes } = LIMITS.o2o;
    const windowSeconds = pinLockMinutes * 60;
    const count = await redis.incr(failKey(orderId));
    if (count === null) throw unavailable();
    if (count === 1) await redis.expire(failKey(orderId), windowSeconds);
    if (count < pinAttemptsMax) return { attemptsLeft: pinAttemptsMax - count, locked: false, retryAfterSeconds: 0 };
    await redis.set(lockKey(orderId), String(this.nowMs() + windowSeconds * 1000), windowSeconds);
    await redis.del(failKey(orderId));
    return { attemptsLeft: 0, locked: true, retryAfterSeconds: windowSeconds };
  }

  async reset(orderId: string): Promise<void> {
    await Promise.all([redis.del(failKey(orderId)), redis.del(lockKey(orderId))]);
  }
}

/** Bản trong bộ nhớ cho unit test — cùng ngữ nghĩa, đồng hồ tiêm được. */
export class InMemoryPinLockout implements IPinLockout {
  private readonly fails = new Map<string, { count: number; resetAt: number }>();
  private readonly locks = new Map<string, number>();

  constructor(private readonly nowMs: () => number = () => Date.now()) {}

  async check(orderId: string): Promise<void> {
    const until = this.locks.get(orderId);
    if (until !== undefined && until > this.nowMs()) throw o2oErrors.pinLocked(Math.ceil((until - this.nowMs()) / 1000));
  }

  async fail(orderId: string) {
    const { pinAttemptsMax, pinLockMinutes } = LIMITS.o2o;
    const windowMs = pinLockMinutes * 60_000;
    const cur = this.fails.get(orderId);
    const entry = cur && cur.resetAt > this.nowMs() ? cur : { count: 0, resetAt: this.nowMs() + windowMs };
    entry.count += 1;
    this.fails.set(orderId, entry);
    if (entry.count < pinAttemptsMax) return { attemptsLeft: pinAttemptsMax - entry.count, locked: false, retryAfterSeconds: 0 };
    this.locks.set(orderId, this.nowMs() + windowMs);
    this.fails.delete(orderId);
    return { attemptsLeft: 0, locked: true, retryAfterSeconds: windowMs / 1000 };
  }

  async reset(orderId: string): Promise<void> {
    this.fails.delete(orderId);
    this.locks.delete(orderId);
  }
}
