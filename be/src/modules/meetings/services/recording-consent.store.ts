import type { MeetingRedisPort } from "./meeting-room.store";

/** Yêu cầu đồng ý ghi hình đang hiệu lực của một phiên họp (chỉ MỘT tại một thời điểm — yêu cầu mới thay yêu cầu cũ). */
export interface ConsentRequest {
  requestId: string;
  requestedBy: string;
  expiresAt: string;
}

export interface ConsentAnswer {
  accept: boolean;
  at: string;
}

const currentKey = (callId: string): string => `rec:consent-current:${callId}`;
const answersKey = (callId: string, requestId: string): string => `rec:consent:${callId}:${requestId}`;

/**
 * Trạng thái TẠM của đồng ý ghi hình trên Redis (README p2-06 §4): `rec:consent-current:<callId>` → yêu cầu hiệu lực (TTL `consentRequestTtlSeconds`),
 * `rec:consent:<callId>:<requestId>` (hash `userId → {accept, at}`) cùng TTL. Mongo giữ `consentSnapshot` của bản ghi ĐÃ bắt đầu — Redis mất dữ liệu chỉ làm
 * chủ trì phải hỏi lại. Redis lỗi ⇒ 503 (KHÔNG fail-open: fail-open = ghi hình khi chưa chắc mọi người đã đồng ý).
 */
export class RecordingConsentStore {
  constructor(private readonly port: MeetingRedisPort) {}

  /** Mở yêu cầu mới (thay yêu cầu cũ nếu còn). Trả `expiresAt`. */
  async open(callId: string, req: Omit<ConsentRequest, "expiresAt">, ttlSeconds: number, now: Date): Promise<ConsentRequest> {
    const old = await this.current(callId);
    if (old) await this.port.del(answersKey(callId, old.requestId));
    const full: ConsentRequest = { ...req, expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString() };
    await this.port.set(currentKey(callId), JSON.stringify(full), ttlSeconds);
    return full;
  }

  /** Yêu cầu hiện hành còn hạn; `null` khi chưa có/đã hết hạn/đã đóng. */
  async current(callId: string): Promise<ConsentRequest | null> {
    const raw = await this.port.get(currentKey(callId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ConsentRequest;
    } catch {
      return null;
    }
  }

  /** Ghi (đè) câu trả lời của một người — dùng lại TTL còn lại của yêu cầu. */
  async answer(callId: string, req: ConsentRequest, userId: string, accept: boolean, now: Date): Promise<void> {
    const remaining = Math.max(1, Math.ceil((new Date(req.expiresAt).getTime() - now.getTime()) / 1000));
    await this.port.hset(answersKey(callId, req.requestId), userId, JSON.stringify({ accept, at: now.toISOString() } satisfies ConsentAnswer), remaining);
  }

  async answers(callId: string, requestId: string): Promise<Map<string, ConsentAnswer>> {
    const all = await this.port.hgetall(answersKey(callId, requestId));
    const out = new Map<string, ConsentAnswer>();
    for (const [userId, raw] of Object.entries(all)) {
      try {
        out.set(userId, JSON.parse(raw) as ConsentAnswer);
      } catch {
        // mục hỏng: bỏ qua (TTL sẽ dọn)
      }
    }
    return out;
  }

  /** Bắt đầu ghi xong (snapshot đã vào Mongo) hoặc yêu cầu bị thay: dọn khoá. */
  async close(callId: string, requestId: string): Promise<void> {
    await this.port.del(answersKey(callId, requestId));
    await this.port.del(currentKey(callId));
  }
}
