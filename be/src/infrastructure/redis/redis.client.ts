import { createClient, type RedisClientType } from "redis";
import { env } from "../../core/config";
import { logger } from "../logger";

/** Chặn trần thời gian chờ connect ban đầu — client mặc định tự retry vô hạn
 * (reconnectStrategy) nên `await this.client.connect()` không bao giờ reject
 * khi Redis down, treo `startServer()` mãi mãi. `try/catch` một mình không đủ
 * vì không có gì để `catch`. Client vẫn tiếp tục tự reconnect nền sau khi hết
 * hạn — các phương thức khác đã tự no-op khi `!isReady`. */
const CONNECT_TIMEOUT_MS = 5000;

class RedisClient {
  private client: RedisClientType | null = null;

  /**
   * ⚠️ `client.isOpen` chỉ có nghĩa "đã gọi `.connect()`" — nó thành `true`
   * NGAY khi `.connect()` được gọi (trước cả khi bắt tay TCP xong) và KHÔNG
   * BAO GIỜ quay lại `false` khi mất kết nối/đang tự retry nền, chỉ `false`
   * sau `.disconnect()`/`.quit()` tường minh. Dùng `isOpen` để quyết định
   * "có nên gửi lệnh không" là SAI — mọi lệnh khác (`get`/`set`/...) sẽ treo
   * vô thời hạn ở lần gọi THỨ HAI trở đi sau khi Redis down (lần đầu còn có
   * `connect()` với timeout ở trên chặn; các lệnh sau thấy `isOpen=true` nên
   * bỏ qua `connect()`, gọi thẳng lệnh trên client vẫn đang retry ngầm).
   * `isReady` mới phản ánh đúng "đã bắt tay xong, sẵn sàng nhận lệnh" — toggle
   * lại `false` khi mất kết nối. MỌI method bên dưới PHẢI kiểm `isReady`,
   * không kiểm `isOpen`.
   */
  private isReady(): boolean {
    return this.client?.isReady === true;
  }

  async connect(): Promise<RedisClientType> {
    if (this.isReady()) {
      return this.client!;
    }
    // Client cũ còn "open" (đã gọi connect() trước đó) nhưng chưa/không còn
    // ready — dọn sạch trước khi tạo client mới, tránh tích luỹ client zombie
    // tự retry nền vô thời hạn mỗi lần connect() được gọi lại.
    if (this.client?.isOpen) {
      this.client.disconnect().catch(() => undefined);
    }
    try {
      this.client = createClient({
        url: env.REDIS_URL,
        password: env.REDIS_PASSWORD,
      });
      // Client tự reconnect nền với backoff và phát "error" ở MỖI lần thử —
      // chỉ log lần đầu của mỗi đợt mất kết nối, reset khi "ready" lại.
      let outageLogged = false;
      this.client.on("error", (err: Error) => {
        if (outageLogged) return;
        outageLogged = true;
        logger.error(`Redis error — đang tự kết nối lại nền, ẩn các lỗi lặp lại:`, err);
      });
      this.client.on("connect", () => logger.info("Redis connected"));
      this.client.on("ready", () => {
        outageLogged = false;
        logger.info("Redis ready");
      });
      this.client.on("end", () => logger.info("Redis disconnected"));
      await Promise.race([
        this.client.connect(),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error(`Redis connect quá ${CONNECT_TIMEOUT_MS}ms`)),
            CONNECT_TIMEOUT_MS
          ).unref();
        }),
      ]);
      return this.client;
    } catch (err) {
      logger.error("Redis connect failed:", err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client?.isOpen) {
      // `.disconnect()` (đóng socket ngay) thay vì `.quit()` (gửi lệnh QUIT,
      // cần kết nối đang sống) — `.quit()` treo vô thời hạn nếu client đang
      // `isOpen` nhưng không `isReady` (đang tự retry nền).
      await this.client.disconnect().catch(() => undefined);
      this.client = null;
    }
  }

  getClient(): RedisClientType | null {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.isReady()) await this.connect();
      const pong = await this.client!.ping();
      return pong === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * Áp `REDIS_KEY_PREFIX` (env) vào MỌI key mà wrapper này chạm tới — namespace
   * theo môi trường/instance để nhiều app dùng chung 1 Redis không đụng key
   * nhau. Mọi phương thức bên dưới PHẢI đi qua đây, không tự ghép key thô.
   */
  private k(key: string): string {
    return `${env.REDIS_KEY_PREFIX}${key}`;
  }

  async get<T = string>(key: string): Promise<T | null> {
    if (!this.isReady()) return null;
    const val = await this.client!.get(this.k(key));
    if (val === null || val === undefined) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as T;
    }
  }

  async set(key: string, value: string | object, ttlSeconds?: number): Promise<void> {
    if (!this.isReady()) return;
    const str = typeof value === "string" ? value : JSON.stringify(value);
    if (ttlSeconds !== null && ttlSeconds !== undefined) {
      await this.client!.setEx(this.k(key), ttlSeconds, str);
    } else {
      await this.client!.set(this.k(key), str);
    }
  }

  async del(key: string): Promise<void> {
    if (this.isReady()) await this.client!.del(this.k(key));
  }

  /**
   * GET + DEL nguyên tử (lệnh Redis `GETDEL`) — dùng cho nonce/one-time token:
   * đọc và xoá trong 1 round-trip để 2 request đồng thời không thể cùng tiêu
   * thụ 1 giá trị (race condition nếu tách thành get() rồi del() riêng).
   */
  async getdel<T = string>(key: string): Promise<T | null> {
    if (!this.isReady()) return null;
    const val = await this.client!.getDel(this.k(key));
    if (val === null || val === undefined) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as T;
    }
  }

  /** Atomically increment a key. Returns the new value, or null if Redis is down. */
  async incr(key: string): Promise<number | null> {
    if (!this.isReady()) return null;
    return this.client!.incr(this.k(key));
  }

  /** Atomically increment by `by`. Returns the new value, or null if Redis is down. */
  async incrBy(key: string, by: number): Promise<number | null> {
    if (!this.isReady()) return null;
    return this.client!.incrBy(this.k(key), by);
  }

  /** Set TTL (seconds) on an existing key. No-op if Redis is down. */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.isReady()) return;
    await this.client!.expire(this.k(key), ttlSeconds);
  }

  /** `SET key value NX EX ttlSeconds` — true nếu ghi được (key chưa tồn tại), false nếu đã có hoặc Redis down. Dùng cho throttle/lease (p0-03 presence). */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isReady()) return false;
    const result = await this.client!.set(this.k(key), value, { NX: true, EX: ttlSeconds });
    return result === "OK";
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isReady()) return false;
    return (await this.client!.exists(this.k(key))) > 0;
  }

  // ─── Hash operations (p0-03 — presence lease, connection registry) ────────

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.isReady()) return;
    await this.client!.hSet(this.k(key), field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.isReady()) return {};
    return this.client!.hGetAll(this.k(key));
  }

  async hdel(key: string, field: string): Promise<void> {
    if (!this.isReady()) return;
    await this.client!.hDel(this.k(key), field);
  }

  /**
   * `SCAN` theo pattern (đã áp `REDIS_KEY_PREFIX`) — KHÔNG dùng `KEYS` (block
   * toàn bộ Redis khi dataset lớn). Trả key đã BỎ prefix, để nơi gọi dùng lại
   * đúng dạng `k(key)` đã truyền vào các hàm khác trong class này.
   */
  async scanKeys(pattern: string): Promise<string[]> {
    if (!this.isReady()) return [];
    const prefixed = this.k(pattern);
    const found: string[] = [];
    for await (const key of this.client!.scanIterator({ MATCH: prefixed, COUNT: 200 })) {
      found.push(typeof key === "string" ? key : String(key));
    }
    const prefixLen = env.REDIS_KEY_PREFIX.length;
    return found.map((raw) => (raw.startsWith(env.REDIS_KEY_PREFIX) ? raw.slice(prefixLen) : raw));
  }

  // ─── List operations ────────────────────────────────────────────────────

  async lpush(key: string, ...values: string[]): Promise<number | null> {
    if (!this.isReady()) return null;
    return this.client!.lPush(this.k(key), values);
  }

  async llen(key: string): Promise<number> {
    if (!this.isReady()) return 0;
    return this.client!.lLen(this.k(key));
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.isReady()) return [];
    return this.client!.lRange(this.k(key), start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (!this.isReady()) return;
    await this.client!.lTrim(this.k(key), start, stop);
  }

  /**
   * `LRANGE 0 -1` + `DEL` NGUYÊN TỬ (`multi()`) — lấy trọn danh sách rồi xoá
   * key trong 1 lượt, tránh 2 job `push.send` cùng cửa sổ đọc trùng phần tử
   * (p0-06 §5.5 gộp burst). Trả `[]` nếu key rỗng/không tồn tại/Redis down.
   */
  async popAll(key: string): Promise<string[]> {
    if (!this.isReady()) return [];
    const prefixed = this.k(key);
    const results = await this.client!.multi().lRange(prefixed, 0, -1).del(prefixed).exec();
    const first = results?.[0];
    return Array.isArray(first) ? (first as string[]) : [];
  }
}

export const redis = new RedisClient();
