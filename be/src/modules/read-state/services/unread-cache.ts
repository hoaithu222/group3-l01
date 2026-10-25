import { redis } from "../../../infrastructure/redis";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";

export type UnreadSummaryChangedReason = "MUTE" | "READ_ALL" | "REBUILD";

/**
 * Cache Redis đếm chưa đọc (be.md §5.2) — TTL `LIMITS.notification.unreadCacheSeconds` (10 s).
 * Thay đổi (đọc, mute) chỉ XOÁ khoá; tin mới dựa vào TTL + `channel:activity`/`conversation:activity`.
 * Mọi thao tác best-effort — lỗi Redis không được làm hỏng request chính (đọc rơi về DB).
 */
export class UnreadCache {
  summaryKey(userId: string): string {
    return `unread:summary:${userId}`;
  }

  channelKey(userId: string, channelId: string): string {
    return `unread:ch:${userId}:${channelId}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return await redis.get<T>(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: object): Promise<void> {
    try {
      await redis.set(key, value, LIMITS.notification.unreadCacheSeconds);
    } catch {
      // best-effort
    }
  }

  async invalidateSummary(userId: string): Promise<void> {
    try {
      await redis.del(this.summaryKey(userId));
    } catch {
      // best-effort — TTL 10 s tự hết
    }
  }

  async invalidateChannel(userId: string, channelId: string): Promise<void> {
    try {
      await redis.del(this.channelKey(userId, channelId));
    } catch {
      // best-effort
    }
  }
}

const DEBOUNCE_SECONDS = 2;

/**
 * Phát `unread:summary-changed` tới `user:{id}` (be.md §6) khi client KHÔNG tự suy được thay đổi
 * (mute/đọc tất cả/rebuild) — debounce 2 s/user bằng khoá Redis (chỉ lượt đầu trong cửa sổ được phát).
 * Module p1-03/p1-05 gọi qua `@modules/read-state/public` sau khi đổi `notifyMode`/`mutedUntil`.
 */
export async function notifyUnreadSummaryChanged(userId: string, reason: UnreadSummaryChangedReason): Promise<void> {
  try {
    await new UnreadCache().invalidateSummary(userId);
    const acquired = await redis.setNx(`unread:sumchg:${userId}`, "1", DEBOUNCE_SECONDS);
    if (!acquired) return;
    emitToUsers([userId], SocketEvent.UNREAD_SUMMARY_CHANGED, { reason });
  } catch (err) {
    logger.warn("[read-state] Không phát được unread:summary-changed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Xoá cache tổng hợp chưa đọc của nhiều người (vd sau khi ghi mục hộp thư mới) — best-effort. */
export async function invalidateUnreadSummary(userIds: string[]): Promise<void> {
  const cache = new UnreadCache();
  await Promise.all(userIds.map((u) => cache.invalidateSummary(u)));
}
