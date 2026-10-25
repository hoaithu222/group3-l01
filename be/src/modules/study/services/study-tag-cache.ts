import { redis } from "../../../infrastructure/redis";
import type { PopularTag } from "../entities/study-set.interface";

/** Cache thẻ phổ biến (10 phút, `LIMITS.study.popularTagsCacheSeconds`) — `null` khi Redis lỗi/hết hạn (tính lại từ DB). */
export interface IStudyTagCache {
  get(key: string): Promise<PopularTag[] | null>;
  set(key: string, value: PopularTag[], ttlSeconds: number): Promise<void>;
}

export class RedisStudyTagCache implements IStudyTagCache {
  async get(key: string): Promise<PopularTag[] | null> {
    return redis.get<PopularTag[]>(`study:tags:${key}`);
  }

  async set(key: string, value: PopularTag[], ttlSeconds: number): Promise<void> {
    await redis.set(`study:tags:${key}`, value, ttlSeconds);
  }
}

export class InMemoryStudyTagCache implements IStudyTagCache {
  readonly store = new Map<string, PopularTag[]>();

  get(key: string): Promise<PopularTag[] | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: PopularTag[]): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
}
