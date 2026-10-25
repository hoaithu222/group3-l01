import type { AccessResponse, BeClient } from "./be-client";
import type { ResourceKind } from "./resource-kinds";

interface Entry {
  value: AccessResponse | null;
  expiresAt: number;
}

const NEGATIVE_TTL_MS = 5000;
const MAX_ENTRIES = 10_000;

/**
 * Hỏi BE "user này có được vào tài nguyên này không, ở chế độ nào" kèm bộ nhớ đệm ngắn (mặc định 30 s → thu hồi quyền có
 * hiệu lực ≤ 30 s ngay cả khi tin `kick` thất lạc) và gộp các lời gọi đồng thời cùng khoá. Kết quả TỪ CHỐI/không tồn tại chỉ
 * đệm ≤ 5 s để client lặp nối lại không dồn tải về BE, nhưng cấp quyền mới vẫn có hiệu lực nhanh.
 * Lỗi kết nối tới BE KHÔNG được đệm (ném ra để caller từ chối kết nối mới / bỏ qua vòng kiểm lại).
 */
export class AccessService {
  private readonly cache = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<AccessResponse | null>>();

  constructor(
    private readonly be: Pick<BeClient, "access">,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async check(kind: ResourceKind, id: string, userId: string, sv: number, opts: { fresh?: boolean } = {}): Promise<AccessResponse | null> {
    const key = `${kind}:${id}:${userId}:${sv}`;
    if (!opts.fresh) {
      const hit = this.cache.get(key);
      if (hit && hit.expiresAt > this.now()) return hit.value;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const run = this.be
      .access(kind, id, userId, sv)
      .then((value) => {
        const ttl = value?.allowed === true ? this.ttlMs : Math.min(this.ttlMs, NEGATIVE_TTL_MS);
        if (ttl > 0) this.put(key, { value, expiresAt: this.now() + ttl });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  /** Xoá mọi mục của 1 user (vd sau `kick`) để lần nối lại hỏi BE ngay. */
  invalidateUser(userId: string): void {
    for (const key of this.cache.keys()) if (key.split(":")[2] === userId) this.cache.delete(key);
  }

  invalidateResource(kind: ResourceKind, id: string): void {
    const prefix = `${kind}:${id}:`;
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  private put(key: string, entry: Entry): void {
    if (this.cache.size >= MAX_ENTRIES) {
      const now = this.now();
      for (const [k, v] of this.cache) if (v.expiresAt <= now) this.cache.delete(k);
      // Vẫn đầy → bỏ mục cũ nhất (Map giữ thứ tự chèn).
      if (this.cache.size >= MAX_ENTRIES) {
        const oldest = this.cache.keys().next();
        if (!oldest.done) this.cache.delete(oldest.value);
      }
    }
    this.cache.set(key, entry);
  }
}
