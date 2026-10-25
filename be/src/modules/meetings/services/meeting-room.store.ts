import { env } from "../../../core/config";
import { AppError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { redis } from "../../../infrastructure/redis";

/**
 * Cổng Redis tối thiểu cho trạng thái TẠM của phòng họp (be.md §2 bảng khoá): hàng chờ (hash), khoá "đã duyệt"/"đã từ chối", mốc đóng phòng.
 * Tách interface để test không cần Redis thật (`InMemoryMeetingRedisPort`); bản thật dùng client node-redis, áp `REDIS_KEY_PREFIX`.
 * Redis lỗi ⇒ 503 (KHÔNG fail-open: fail-open ở đây nghĩa là cho người lạ vào phòng không qua duyệt).
 */
export interface MeetingRedisPort {
  /** `HSETNX` + gia hạn TTL của hash. `true` = thêm mới. */
  hsetNx(key: string, field: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** `HSET` GHI ĐÈ + gia hạn TTL của hash (p2-06: người tham gia đổi ý đồng ý ↔ từ chối). */
  hset(key: string, field: string, value: string, ttlSeconds: number): Promise<void>;
  /** `HDEL` — `true` khi THỰC SỰ xoá (hai host cùng duyệt: chỉ MỘT nhận `true`). */
  hdel(key: string, field: string): Promise<boolean>;
  hgetall(key: string): Promise<Record<string, string>>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<boolean>;
}

const unavailable = (): AppError => new AppError("Dịch vụ tạm thời không khả dụng", 503, ErrorCode.SYS_503);

export class NodeMeetingRedisPort implements MeetingRedisPort {
  private client() {
    const c = redis.getClient();
    if (!c?.isReady) throw unavailable();
    return c;
  }

  private k(key: string): string {
    return `${env.REDIS_KEY_PREFIX}${key}`;
  }

  async hsetNx(key: string, field: string, value: string, ttlSeconds: number): Promise<boolean> {
    const c = this.client();
    const added = await c.hSetNX(this.k(key), field, value);
    await c.expire(this.k(key), ttlSeconds);
    return added;
  }

  async hset(key: string, field: string, value: string, ttlSeconds: number): Promise<void> {
    const c = this.client();
    await c.hSet(this.k(key), field, value);
    await c.expire(this.k(key), ttlSeconds);
  }

  async hdel(key: string, field: string): Promise<boolean> {
    return (await this.client().hDel(this.k(key), field)) > 0;
  }

  hgetall(key: string): Promise<Record<string, string>> {
    return this.client().hGetAll(this.k(key));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client().set(this.k(key), value, { EX: ttlSeconds });
  }

  get(key: string): Promise<string | null> {
    return this.client().get(this.k(key));
  }

  async del(key: string): Promise<boolean> {
    return (await this.client().del(this.k(key))) > 0;
  }
}

/** Bản trong bộ nhớ có TTL theo đồng hồ giả — cho test (không có Redis cục bộ). */
export class InMemoryMeetingRedisPort implements MeetingRedisPort {
  private readonly strings = new Map<string, { value: string; expiresAt: number }>();
  private readonly hashes = new Map<string, { fields: Map<string, string>; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private hash(key: string) {
    const h = this.hashes.get(key);
    if (h && h.expiresAt <= this.now()) {
      this.hashes.delete(key);
      return undefined;
    }
    return h;
  }

  hsetNx(key: string, field: string, value: string, ttlSeconds: number): Promise<boolean> {
    const h = this.hash(key) ?? { fields: new Map<string, string>(), expiresAt: 0 };
    const added = !h.fields.has(field);
    if (added) h.fields.set(field, value);
    h.expiresAt = this.now() + ttlSeconds * 1000;
    this.hashes.set(key, h);
    return Promise.resolve(added);
  }

  hset(key: string, field: string, value: string, ttlSeconds: number): Promise<void> {
    const h = this.hash(key) ?? { fields: new Map<string, string>(), expiresAt: 0 };
    h.fields.set(field, value);
    h.expiresAt = this.now() + ttlSeconds * 1000;
    this.hashes.set(key, h);
    return Promise.resolve();
  }

  hdel(key: string, field: string): Promise<boolean> {
    return Promise.resolve(this.hash(key)?.fields.delete(field) ?? false);
  }

  hgetall(key: string): Promise<Record<string, string>> {
    return Promise.resolve(Object.fromEntries(this.hash(key)?.fields ?? []));
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.strings.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    const e = this.strings.get(key);
    if (!e) return Promise.resolve(null);
    if (e.expiresAt <= this.now()) {
      this.strings.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(e.value);
  }

  del(key: string): Promise<boolean> {
    return Promise.resolve(this.strings.delete(key) || this.hashes.delete(key));
  }

  /** Test: xoá sạch (giả lập mất dữ liệu Redis). */
  flushAll(): void {
    this.strings.clear();
    this.hashes.clear();
  }
}

export interface LobbyEntry {
  userId: string;
  displayName: string;
  requestedAt: string;
  deviceId: string;
}

const lobbyKey = (meetingId: string): string => `meet:lobby:${meetingId}`;
const admittedKey = (callId: string, userId: string): string => `meet:admitted:${callId}:${userId}`;
const deniedKey = (callId: string, userId: string): string => `meet:denied:${callId}:${userId}`;
const closingKey = (callId: string): string => `meet:closing:${callId}`;

/**
 * Trạng thái phòng họp trên Redis (be.md §2): `meet:lobby:<meetingId>` (hash), `meet:admitted:<callId>:<userId>`, `meet:denied:<callId>:<userId>`,
 * `meet:closing:<callId>`. Mongo là nguồn sự thật của cuộc họp/phiên (`Meeting`, `CallParticipant`) — ở đây CHỈ giữ dữ liệu tạm có TTL;
 * Redis mất dữ liệu ⇒ người đang chờ phải xin vào lại, không làm hỏng phiên đang chạy.
 */
export class MeetingRoomStore {
  /** `port` công khai để các store tạm khác của họp (đồng ý ghi hình, p2-06) dùng CHUNG một cổng Redis (một nơi thay bản giả trong test). */
  constructor(readonly port: MeetingRedisPort) {}

  /** `true` khi mới thêm (đã có trong hàng chờ ⇒ `false`, không phát lại `REQUESTED`). */
  addLobby(meetingId: string, entry: LobbyEntry): Promise<boolean> {
    return this.port.hsetNx(lobbyKey(meetingId), entry.userId, JSON.stringify(entry), LIMITS.meeting.lobbyTtlHours * 3600);
  }

  /** Nguyên tử: chỉ MỘT lời gọi nhận `true` cho cùng người (duyệt song song, huỷ song song với duyệt). */
  removeLobby(meetingId: string, userId: string): Promise<boolean> {
    return this.port.hdel(lobbyKey(meetingId), userId);
  }

  async listLobby(meetingId: string): Promise<LobbyEntry[]> {
    const all = await this.port.hgetall(lobbyKey(meetingId));
    const out: LobbyEntry[] = [];
    for (const raw of Object.values(all)) {
      try {
        out.push(JSON.parse(raw) as LobbyEntry);
      } catch {
        // mục hỏng: bỏ qua (TTL sẽ dọn)
      }
    }
    return out.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }

  async lobbyCount(meetingId: string): Promise<number> {
    return Object.keys(await this.port.hgetall(lobbyKey(meetingId))).length;
  }

  clearLobby(meetingId: string): Promise<boolean> {
    return this.port.del(lobbyKey(meetingId));
  }

  async setAdmitted(callId: string, userId: string, byUserId: string): Promise<void> {
    await this.port.set(admittedKey(callId, userId), byUserId, LIMITS.meeting.admittedTtlSeconds);
  }

  async isAdmitted(callId: string, userId: string): Promise<boolean> {
    return (await this.port.get(admittedKey(callId, userId))) !== null;
  }

  clearAdmitted(callId: string, userId: string): Promise<boolean> {
    return this.port.del(admittedKey(callId, userId));
  }

  async setDenied(callId: string, userId: string): Promise<void> {
    await this.port.set(deniedKey(callId, userId), "1", LIMITS.meeting.deniedTtlSeconds);
  }

  async isDenied(callId: string, userId: string): Promise<boolean> {
    return (await this.port.get(deniedKey(callId, userId))) !== null;
  }

  /** Giờ tự đóng đã được báo (cảnh báo "sắp kết thúc") — để snapshot/join trả `closingAt` cho người vào sau. */
  async setClosingAt(callId: string, at: Date): Promise<void> {
    await this.port.set(closingKey(callId), at.toISOString(), 3 * 3600);
  }

  async getClosingAt(callId: string): Promise<string | null> {
    return this.port.get(closingKey(callId));
  }
}
