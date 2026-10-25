import { env } from "../../../core/config";
import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";

/** Cổng Redis tối thiểu của Pomodoro (kết quả lệnh idempotent, claim phát socket). Tách interface để test không cần Redis thật. */
export interface PomodoroRedisPort {
  /** `SET key value NX EX ttl` — `true` nếu ghi được. */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Cài đặt thật trên node-redis (client của wrapper `redis`), áp `REDIS_KEY_PREFIX`. Client chưa sẵn sàng → ném (store tự hạ cấp, không chặn lệnh). */
export class NodeRedisPomodoroPort implements PomodoroRedisPort {
  private client() {
    const c = redis.getClient();
    if (!c?.isReady) throw new Error("Redis chưa sẵn sàng");
    return c;
  }

  private k(key: string): string {
    return `${env.REDIS_KEY_PREFIX}${key}`;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client().set(this.k(key), value, { NX: true, EX: ttlSeconds })) === "OK";
  }

  get(key: string): Promise<string | null> {
    return this.client().get(this.k(key));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client().set(this.k(key), value, { EX: ttlSeconds });
  }

  async del(key: string): Promise<void> {
    await this.client().del(this.k(key));
  }
}

/** Bản trong bộ nhớ có TTL theo đồng hồ giả — cho unit/integration test (không có Redis cục bộ). */
export class InMemoryPomodoroRedisPort implements PomodoroRedisPort {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();
  /** Test: đặt `true` để mô phỏng Redis mất kết nối (mọi lệnh ném lỗi). */
  down = false;

  constructor(private readonly now: () => number = () => Date.now()) {}

  private live(key: string): string | null {
    if (this.down) throw new Error("Redis down (giả lập)");
    const e = this.data.get(key);
    if (!e) return null;
    if (e.expiresAt <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return e.value;
  }

  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      if (this.live(key) !== null) return Promise.resolve(false);
      this.data.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
      return Promise.resolve(true);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  get(key: string): Promise<string | null> {
    try {
      return Promise.resolve(this.live(key));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.down) return Promise.reject(new Error("Redis down (giả lập)"));
    this.data.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    if (this.down) return Promise.reject(new Error("Redis down (giả lập)"));
    this.data.delete(key);
    return Promise.resolve();
  }
}

/** Kết quả một lệnh đã chạy xong — chỉ đủ để trả LẠI trạng thái hiện tại (không lưu snapshot cũ: `serverNow` cũ làm lệch đồng hồ client). */
export interface CommandResult {
  sessionId: string | null;
  version: number;
}

export type CommandClaim = { state: "NEW" } | { state: "PENDING" } | { state: "DONE"; result: CommandResult };

const PENDING = "PENDING";
/** PENDING chỉ giữ ngắn: tiến trình chết giữa lệnh không được kẹt `commandId` đó cả giờ (kết quả xong mới giữ TTL đầy đủ). */
export const PENDING_TTL_SECONDS = 30;

/**
 * Idempotency lệnh của chủ phòng (be.md §5): `SET pomo:cmd:{…} PENDING NX EX 30` (đang chạy) → xong ghi kết quả TTL 1 giờ; đã có kết quả thì trả lại (PM-08), PENDING → 409 `RES_004`.
 * Khoá gắn cả kênh + người gửi (`commandId` là UUID của client, không để người khác phát lại kết quả của mình). Redis lỗi → hạ cấp (lệnh vẫn chạy —
 * `expectedVersion` + CAS ở DB đã chặn áp dụng hai lần), không fail-closed.
 */
export class PomodoroCommandStore {
  constructor(
    private readonly port: PomodoroRedisPort,
    private readonly ttlSeconds: number = LIMITS.pomodoro.commandIdempotencySeconds
  ) {}

  keyOf(channelId: string, userId: string, commandId: string): string {
    return `pomo:cmd:${channelId}:${userId}:${commandId}`;
  }

  async begin(key: string): Promise<CommandClaim> {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (await this.port.setNx(key, PENDING, PENDING_TTL_SECONDS)) return { state: "NEW" };
        const raw = await this.port.get(key);
        if (raw === null) continue; // hết hạn giữa hai lệnh — thử giành lại
        if (raw === PENDING) return { state: "PENDING" };
        const result = safeParse(raw);
        if (result) return { state: "DONE", result };
        return { state: "PENDING" };
      }
    } catch (err) {
      logger.warn("[pomodoro] Redis lỗi khi kiểm commandId — chạy lệnh không idempotency", { error: err instanceof Error ? err.message : String(err) });
    }
    return { state: "NEW" };
  }

  async complete(key: string, result: CommandResult): Promise<void> {
    await this.port.set(key, JSON.stringify(result), this.ttlSeconds).catch(() => undefined);
  }

  /** Lệnh lỗi: nhả khoá để client gửi lại CÙNG `commandId` (mất mạng/hết hạn) mà không bị kẹt PENDING. */
  async abort(key: string): Promise<void> {
    await this.port.del(key).catch(() => undefined);
  }
}

function safeParse(raw: string): CommandResult | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CommandResult>;
    return typeof parsed.version === "number" ? { sessionId: parsed.sessionId ?? null, version: parsed.version } : null;
  } catch {
    return null;
  }
}
