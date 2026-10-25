import { randomUUID } from "crypto";
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { redis } from "../../../infrastructure/redis";

/** TTL khoá đường đồng bộ (be.md §5.4). Lô nền KHÔNG dựa vào khoá này — `RescheduleBatch.activeKey` giữ ở tầng DB. */
export const RESCHEDULE_LOCK_TTL_SECONDS = 60;

export interface RescheduleLockHandle {
  key: string;
  token: string;
}

/** Khoá `reschedule:board:<boardId>` — MỘT lệnh dời lịch chạy mỗi bảng tại một thời điểm. */
export interface IRescheduleLock {
  /** `null` khi bảng đang bị giữ khoá (→ `TASK_020`); ném `503 SYS_503` khi Redis không dùng được (KHÔNG fail-open). */
  acquire(boardId: string): Promise<RescheduleLockHandle | null>;
  /** Chỉ nhả khi khoá vẫn của `handle` (hết TTL và bị lệnh khác chiếm thì không xoá nhầm). Lỗi Redis bị nuốt (TTL sẽ dọn). */
  release(handle: RescheduleLockHandle): Promise<void>;
}

export const rescheduleLockKey = (boardId: string): string => `reschedule:board:${boardId}`;

const unavailable = (): AppError => new AppError("Dịch vụ tạm thời không khả dụng", 503, ErrorCode.SYS_503);

/**
 * Cài đặt Redis. `redis.setNx` trả `false` cả khi khoá đang bị giữ lẫn khi Redis mất kết nối — phân biệt bằng `exists`:
 * khoá tồn tại ⇒ đang bị giữ; không tồn tại ⇒ Redis lỗi ⇒ 503. Token có tiền tố `rs-` để `redis.get` (tự `JSON.parse`) trả nguyên chuỗi.
 */
export class RedisRescheduleLock implements IRescheduleLock {
  async acquire(boardId: string): Promise<RescheduleLockHandle | null> {
    const key = rescheduleLockKey(boardId);
    const token = `rs-${randomUUID()}`;
    if (await redis.setNx(key, token, RESCHEDULE_LOCK_TTL_SECONDS)) return { key, token };
    if (await redis.exists(key)) return null;
    throw unavailable();
  }

  async release(handle: RescheduleLockHandle): Promise<void> {
    try {
      if ((await redis.get<string>(handle.key)) === handle.token) await redis.del(handle.key);
    } catch {
      // TTL 60 s sẽ dọn khoá.
    }
  }
}

/** Bản trong bộ nhớ cho unit test. */
export class InMemoryRescheduleLock implements IRescheduleLock {
  readonly held = new Map<string, string>();

  acquire(boardId: string): Promise<RescheduleLockHandle | null> {
    const key = rescheduleLockKey(boardId);
    if (this.held.has(key)) return Promise.resolve(null);
    const token = `rs-${randomUUID()}`;
    this.held.set(key, token);
    return Promise.resolve({ key, token });
  }

  release(handle: RescheduleLockHandle): Promise<void> {
    if (this.held.get(handle.key) === handle.token) this.held.delete(handle.key);
    return Promise.resolve();
  }
}
