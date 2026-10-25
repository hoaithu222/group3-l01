import { randomUUID } from "crypto";
import { env } from "../../../core/config";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import { redis } from "../../../infrastructure/redis";
import type { CallScopeTypeValue } from "../entities/call.interface";

/**
 * Cổng Redis tối thiểu cho khoá nóng của cuộc gọi. Tách thành interface để test không cần Redis thật
 * (`InMemoryCallRedisPort`) — bản thật (`NodeRedisCallPort`) dùng Lua compare-and-delete/expire (be.md §5.1).
 */
export interface CallRedisPort {
  /** `SET key value NX EX ttl` — `true` nếu ghi được. */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** `SET key value NX PX ttl` — cho khoá ngắn. */
  setNxPx(key: string, value: string, ttlMs: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<Array<string | null>>;
  /** Lua: `if GET == expected then DEL`. `true` nếu đã xoá. */
  compareAndDelete(key: string, expected: string): Promise<boolean>;
  /** Lua: `if GET == expected then EXPIRE`. `true` nếu đã gia hạn. */
  compareAndExpire(key: string, expected: string, ttlSeconds: number): Promise<boolean>;
}

const LUA_COMPARE_DELETE = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`;
const LUA_COMPARE_EXPIRE = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("EXPIRE", KEYS[1], ARGV[2]) end return 0`;

function unavailable(): AppError {
  return new AppError("Dịch vụ tạm thời không khả dụng", 503, ErrorCode.SYS_503);
}

/** Cài đặt thật trên node-redis (client của wrapper `redis`), áp `REDIS_KEY_PREFIX`. Redis lỗi → 503 (KHÔNG fail-open). */
export class NodeRedisCallPort implements CallRedisPort {
  private client() {
    const c = redis.getClient();
    // `isOpen` chỉ có nghĩa "đã gọi connect()", không phản ánh đang thật sự
    // dùng được (xem chú thích chi tiết ở `redis.client.ts`) — phải kiểm
    // `isReady`, nếu không lệnh gửi trên client này sẽ treo thay vì 503 ngay.
    if (!c?.isReady) throw unavailable();
    return c;
  }

  private k(key: string): string {
    return `${env.REDIS_KEY_PREFIX}${key}`;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client().set(this.k(key), value, { NX: true, EX: ttlSeconds })) === "OK";
  }

  async setNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
    return (await this.client().set(this.k(key), value, { NX: true, PX: ttlMs })) === "OK";
  }

  get(key: string): Promise<string | null> {
    return this.client().get(this.k(key));
  }

  mget(keys: string[]): Promise<Array<string | null>> {
    if (keys.length === 0) return Promise.resolve([]);
    return this.client().mGet(keys.map((key) => this.k(key)));
  }

  async compareAndDelete(key: string, expected: string): Promise<boolean> {
    const n = await this.client().eval(LUA_COMPARE_DELETE, { keys: [this.k(key)], arguments: [expected] });
    return Number(n) > 0;
  }

  async compareAndExpire(key: string, expected: string, ttlSeconds: number): Promise<boolean> {
    const n = await this.client().eval(LUA_COMPARE_EXPIRE, { keys: [this.k(key)], arguments: [expected, String(ttlSeconds)] });
    return Number(n) > 0;
  }
}

/** Bản trong bộ nhớ có TTL theo đồng hồ giả — dùng cho unit/integration test (không có Redis cục bộ). */
export class InMemoryCallRedisPort implements CallRedisPort {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private live(key: string): string | null {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.expiresAt <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return e.value;
  }

  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return this.setNxPx(key, value, ttlSeconds * 1000);
  }

  setNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (this.live(key) !== null) return Promise.resolve(false);
    this.data.set(key, { value, expiresAt: this.now() + ttlMs });
    return Promise.resolve(true);
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key));
  }

  mget(keys: string[]): Promise<Array<string | null>> {
    return Promise.resolve(keys.map((k) => this.live(k)));
  }

  compareAndDelete(key: string, expected: string): Promise<boolean> {
    if (this.live(key) !== expected) return Promise.resolve(false);
    this.data.delete(key);
    return Promise.resolve(true);
  }

  compareAndExpire(key: string, expected: string, ttlSeconds: number): Promise<boolean> {
    if (this.live(key) !== expected) return Promise.resolve(false);
    this.data.set(key, { value: expected, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve(true);
  }

  /** Test: giả lập `FLUSHDB` (CL-15). */
  flushAll(): void {
    this.data.clear();
  }

  /** Test: đếm khoá còn sống. */
  keys(): string[] {
    return [...this.data.keys()].filter((k) => this.live(k) !== null);
  }
}

export type AcquireResult = { acquired: true } | { acquired: false; existing: string };

export interface LockOptions {
  retries?: number;
  delayMs?: number;
  ttlMs?: number;
}

/** Hết thời gian chờ khoá `call:lock` — 409 `CALL_011` ("trạng thái đã thay đổi, thử lại"). */
export class CallLockTimeoutError extends AppError {
  constructor(readonly callId: string) {
    super(ErrorMessages[ErrorCode.CALL_011], 409, ErrorCode.CALL_011, { reason: "LOCK_TIMEOUT" });
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `CallRedisStore` (be.md §5.1) — khoá nóng `call:active:<scope>`, `call:busy:<user>`, `call:lock:<call>`. Mongo mới là
 * nguồn sự thật (`Call.activeKey @unique`); Redis lỗi ⇒ 503 (không fail-open). Module p2-03/p2-05 dùng lại, không tự
 * đọc/ghi khoá `call:*`.
 */
export class CallRedisStore {
  constructor(
    private readonly port: CallRedisPort,
    private readonly activeKeyTtlSeconds: number = LIMITS.call.activeKeyTtlSeconds,
    private readonly busyKeyTtlSeconds: number = LIMITS.call.busyKeyTtlSeconds
  ) {}

  private activeKey = (scopeType: CallScopeTypeValue, scopeId: string): string => `call:active:${scopeType}:${scopeId}`;
  private busyKey = (userId: string): string => `call:busy:${userId}`;
  private lockKey = (callId: string): string => `call:lock:${callId}`;

  /** `SET NX EX 90` — giữ ngắn lúc đổ chuông; `promoteActive` kéo dài khi ACTIVE. */
  async acquireActive(scopeType: CallScopeTypeValue, scopeId: string, callId: string): Promise<AcquireResult> {
    const key = this.activeKey(scopeType, scopeId);
    if (await this.port.setNx(key, callId, 90)) return { acquired: true };
    const existing = await this.port.get(key);
    if (existing === callId) return { acquired: true };
    if (existing === null) return this.acquireActive(scopeType, scopeId, callId); // hết hạn giữa 2 lệnh
    return { acquired: false, existing };
  }

  async peekActive(scopeType: CallScopeTypeValue, scopeId: string): Promise<string | null> {
    return this.port.get(this.activeKey(scopeType, scopeId));
  }

  promoteActive(scopeType: CallScopeTypeValue, scopeId: string, callId: string): Promise<boolean> {
    return this.port.compareAndExpire(this.activeKey(scopeType, scopeId), callId, this.activeKeyTtlSeconds);
  }

  releaseActive(scopeType: CallScopeTypeValue, scopeId: string, callId: string): Promise<boolean> {
    return this.port.compareAndDelete(this.activeKey(scopeType, scopeId), callId);
  }

  async acquireBusy(userId: string, callId: string): Promise<AcquireResult> {
    const key = this.busyKey(userId);
    if (await this.port.setNx(key, callId, this.busyKeyTtlSeconds)) return { acquired: true };
    const existing = await this.port.get(key);
    if (existing === callId) return { acquired: true };
    if (existing === null) return this.acquireBusy(userId, callId);
    return { acquired: false, existing };
  }

  /** `MGET` — map userId → callId đang bận (chỉ các user có khoá). */
  async peekBusy(userIds: string[]): Promise<Map<string, string>> {
    const values = await this.port.mget(userIds.map(this.busyKey));
    const out = new Map<string, string>();
    userIds.forEach((id, i) => {
      const v = values[i];
      if (v) out.set(id, v);
    });
    return out;
  }

  releaseBusy(userId: string, callId: string): Promise<boolean> {
    return this.port.compareAndDelete(this.busyKey(userId), callId);
  }

  /** Nhả khoá bận của user theo giá trị khoá cũ (khoá mồ côi của cuộc gọi khác). */
  releaseBusyIf(userId: string, expectedCallId: string): Promise<boolean> {
    return this.port.compareAndDelete(this.busyKey(userId), expectedCallId);
  }

  private screenKey = (callId: string): string => `call:screen:${callId}`;

  /** Slot chia sẻ màn hình của phòng (p2-03): `SET NX` — một người/phòng. Người đang giữ gọi lại → coi như đã giữ (idempotent). */
  async acquireScreen(callId: string, userId: string): Promise<AcquireResult> {
    const key = this.screenKey(callId);
    if (await this.port.setNx(key, userId, this.activeKeyTtlSeconds)) return { acquired: true };
    const holder = await this.port.get(key);
    if (holder === userId) return { acquired: true };
    if (holder === null) return this.acquireScreen(callId, userId);
    return { acquired: false, existing: holder };
  }

  peekScreen(callId: string): Promise<string | null> {
    return this.port.get(this.screenKey(callId));
  }

  /** Nhả slot CHỈ nếu `userId` đang giữ (Lua compare-delete). `true` khi đã nhả. */
  releaseScreen(callId: string, userId: string): Promise<boolean> {
    return this.port.compareAndDelete(this.screenKey(callId), userId);
  }

  /** Khoá ngắn `call:lock:<id>` (PX 5000, thử lại) — thao tác nhiều bước (answer, endCall, reconcile). */
  async withLock<T>(callId: string, fn: () => Promise<T>, opts: LockOptions = {}): Promise<T> {
    const { retries = 3, delayMs = 100, ttlMs = 5000 } = opts;
    const key = this.lockKey(callId);
    const token = randomUUID();
    let acquired = await this.port.setNxPx(key, token, ttlMs);
    for (let i = 0; !acquired && i < retries; i += 1) {
      await sleep(delayMs + Math.floor(Math.random() * delayMs));
      acquired = await this.port.setNxPx(key, token, ttlMs);
    }
    if (!acquired) throw new CallLockTimeoutError(callId);
    try {
      return await fn();
    } finally {
      await this.port.compareAndDelete(key, token).catch(() => false);
    }
  }
}
