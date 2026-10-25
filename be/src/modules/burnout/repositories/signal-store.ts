import { env } from "../../../core/config";
import { LIMITS } from "../../../core/constants/limits";
import { redis } from "../../../infrastructure/redis";

/**
 * Kho tín hiệu TẠM của `burnout` trên Redis (p7-03 be.md §2): tập "đã bật" + HASH bucket theo ngày. CHỈ có "khe nào có hoạt động" và "khe nào có bao nhiêu sự kiện" — không loại/nội dung sự kiện.
 *
 *  - `wb:optin` — SET userId của người ĐANG bật (tra O(1) mỗi nhịp/sự kiện; nguồn sự thật là Mongo, job hằng giờ đồng bộ lại).
 *  - `wb:{userId}:{date}` — HASH `b:<HHmm>` = 1 (khe có hoạt động), `e:<HHmm>` = số sự kiện; TTL `bucketTtlDays`.
 *  - `wb:ev:<băm>` — khoá chống đếm trùng một sự kiện khi job giao lại.
 *
 * Redis KHÔNG sẵn sàng: đọc "có bật không" trả `false` (KHÔNG thu thập khi không chắc — riêng tư đứng trước), ghi tín hiệu bỏ qua (tín hiệu hụt một nhịp, không phải lỗi nghiệp vụ).
 */
export interface IBurnoutSignalStore {
  isOptedIn(userId: string): Promise<boolean>;
  addOptIn(userId: string): Promise<void>;
  removeOptIn(userId: string): Promise<void>;
  optInMembers(): Promise<string[]>;
  markActive(userId: string, date: string, slot: string): Promise<void>;
  incrEvent(userId: string, date: string, slot: string): Promise<void>;
  /** `true` = lần đầu thấy `key` (đếm sự kiện), `false` = đã đếm rồi. Redis không sẵn sàng → `false` (bỏ qua, không đếm). */
  claimEvent(key: string): Promise<boolean>;
  /** HASH thô của một ngày (`{}` nếu chưa có). */
  readDay(userId: string, date: string): Promise<Record<string, string>>;
  /** Xoá MỌI bucket của người này (mọi ngày). */
  deleteUserBuckets(userId: string): Promise<number>;
}

export const OPTIN_KEY = "wb:optin";
export const dayKey = (userId: string, date: string): string => `wb:${userId}:${date}`;

const BUCKET_TTL_SECONDS = LIMITS.wellbeing.bucketTtlDays * 86_400;

export class NodeBurnoutSignalStore implements IBurnoutSignalStore {
  private client() {
    const c = redis.getClient();
    return c?.isReady ? c : null;
  }

  private k(key: string): string {
    return `${env.REDIS_KEY_PREFIX}${key}`;
  }

  async isOptedIn(userId: string): Promise<boolean> {
    const c = this.client();
    return c ? c.sIsMember(this.k(OPTIN_KEY), userId) : false;
  }

  async addOptIn(userId: string): Promise<void> {
    await this.client()?.sAdd(this.k(OPTIN_KEY), userId);
  }

  async removeOptIn(userId: string): Promise<void> {
    await this.client()?.sRem(this.k(OPTIN_KEY), userId);
  }

  async optInMembers(): Promise<string[]> {
    const c = this.client();
    return c ? c.sMembers(this.k(OPTIN_KEY)) : [];
  }

  async markActive(userId: string, date: string, slot: string): Promise<void> {
    const c = this.client();
    if (!c) return;
    await c.hSet(this.k(dayKey(userId, date)), `b:${slot}`, "1");
    await c.expire(this.k(dayKey(userId, date)), BUCKET_TTL_SECONDS);
  }

  async incrEvent(userId: string, date: string, slot: string): Promise<void> {
    const c = this.client();
    if (!c) return;
    await c.hIncrBy(this.k(dayKey(userId, date)), `e:${slot}`, 1);
    await c.expire(this.k(dayKey(userId, date)), BUCKET_TTL_SECONDS);
  }

  claimEvent(key: string): Promise<boolean> {
    return redis.setNx(`wb:ev:${key}`, "1", LIMITS.wellbeing.eventDedupeTtlSeconds);
  }

  async readDay(userId: string, date: string): Promise<Record<string, string>> {
    return redis.hgetall(dayKey(userId, date));
  }

  async deleteUserBuckets(userId: string): Promise<number> {
    const keys = await redis.scanKeys(`wb:${userId}:*`);
    for (const key of keys) await redis.del(key);
    return keys.length;
  }
}
