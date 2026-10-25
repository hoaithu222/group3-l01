import { LIMITS } from "../../core/constants/limits";
import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import type { BlockPort } from "../../shared/ports/block.port";
import type { IBlocksRepo } from "./blocks.repo";

/**
 * Cache danh sách id theo khoá — tách interface để unit test dùng bản in-memory,
 * còn production dùng Redis (`redisBlockCache`). MỌI lỗi cache đều fail-open:
 * `get` lỗi → coi như miss (đọc DB), `set/del` lỗi → chỉ log warn.
 */
export interface BlockCache {
  get(key: string): Promise<string[] | null>;
  set(key: string, ids: string[], ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
}

export const redisBlockCache: BlockCache = {
  async get(key) {
    try {
      const value = await redis.get<string[]>(key);
      return Array.isArray(value) ? value : null;
    } catch (err) {
      logger.warn("[blocks] đọc cache Redis lỗi — chuyển sang đọc DB", { key, error: errorMessage(err) });
      return null;
    }
  },
  async set(key, ids, ttlSeconds) {
    try {
      await redis.set(key, ids, ttlSeconds);
    } catch (err) {
      logger.warn("[blocks] ghi cache Redis lỗi", { key, error: errorMessage(err) });
    }
  },
  async del(keys) {
    try {
      await Promise.all(keys.map((k) => redis.del(k)));
    } catch (err) {
      logger.warn("[blocks] xoá cache Redis lỗi — cache tự hết hạn theo TTL", { error: errorMessage(err) });
    }
  },
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `block:{userId}` = người `userId` ĐÃ CHẶN · `blockedBy:{userId}` = người ĐÃ CHẶN `userId` (be.md p1-08 §1 `block-port.impl.ts`). */
const blockedKey = (userId: string): string => `block:${userId}`;
const blockerKey = (userId: string): string => `blockedBy:${userId}`;

/**
 * Cài đặt `BlockPort` — cache Redis 5 phút (`LIMITS.block.cacheSeconds`) + fallback DB.
 * Ghi block/unblock PHẢI gọi `invalidate([blockerId, blockedId])` SAU commit
 * (xem `blocks.service.ts`); cửa sổ race rất nhỏ giữa commit và xoá cache có thể
 * để lại dữ liệu cũ tối đa 5 phút ở đường không quan trọng (lọc mention/presence) —
 * quyết định nhắn 1-1 (`eligibility.service.ts`) đọc DB trực tiếp nên luôn tươi.
 */
export class BlockPortImpl implements BlockPort {
  constructor(
    private readonly repo: Pick<IBlocksRepo, "listBlockedIds" | "listBlockerIds">,
    private readonly cache: BlockCache = redisBlockCache
  ) {}

  async blockedIdsOf(userId: string): Promise<string[]> {
    const key = blockedKey(userId);
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const ids = await this.repo.listBlockedIds(userId, LIMITS.block.max);
    await this.cache.set(key, ids, LIMITS.block.cacheSeconds);
    return ids;
  }

  async blockerIdsOf(userId: string): Promise<string[]> {
    const key = blockerKey(userId);
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const ids = await this.repo.listBlockerIds(userId);
    await this.cache.set(key, ids, LIMITS.block.cacheSeconds);
    return ids;
  }

  async hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    return (await this.blockedIdsOf(blockerId)).includes(blockedId);
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const [aBlockedB, bBlockedA] = await Promise.all([this.hasBlocked(a, b), this.hasBlocked(b, a)]);
    return aBlockedB || bBlockedA;
  }

  async hiddenBetween(userId: string): Promise<Set<string>> {
    const [blocked, blockers] = await Promise.all([this.blockedIdsOf(userId), this.blockerIdsOf(userId)]);
    return new Set([...blocked, ...blockers]);
  }

  async filterNotificationRecipients(senderId: string, recipientIds: string[]): Promise<string[]> {
    if (recipientIds.length === 0) return [];
    const blockers = new Set(await this.blockerIdsOf(senderId));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of recipientIds) {
      if (blockers.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  async invalidate(userIds: string[]): Promise<void> {
    const keys = Array.from(new Set(userIds)).flatMap((id) => [blockedKey(id), blockerKey(id)]);
    if (keys.length > 0) await this.cache.del(keys);
  }
}
