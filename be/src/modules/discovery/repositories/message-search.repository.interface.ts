import type { DiscoveryMessage, DiscoveryScopeType, SearchRow } from "../entities/discovery.interface";
import type { MongoFilter } from "../services/search-query.builder";

export interface SearchQueryResult {
  rows: SearchRow[];
  /** `true` khi Mongo dừng vì hết `maxTimeMS` — `rows` rỗng (không có kết quả một phần trong 1 cửa sổ). */
  timedOut: boolean;
}

/**
 * Đọc bảng `Message`/`MessageHide` cho module `discovery` (chỉ ĐỌC — mọi ghi tin
 * thuộc `modules/messages`). Tách khỏi `IMessageRepository` của p1-04 để không sửa
 * interface dùng chung và vì cần truy vấn `findRaw` + `maxTimeMS` mà Prisma Client
 * thường không có.
 */
export interface IMessageSearchRepository {
  /**
   * Chạy `filter` (Extended JSON) sắp `createdAt desc, _id desc`, tối đa `limit` dòng,
   * bị chặn bởi `maxTimeMS`. Hết thời gian KHÔNG ném lỗi — trả `{ timedOut: true }`.
   */
  search(filter: MongoFilter, limit: number, maxTimeMs: number): Promise<SearchQueryResult>;
  findMessagesByIds(ids: string[]): Promise<DiscoveryMessage[]>;
  /** Tập `messageId` mà `userId` đã "xoá phía tôi" (`MessageHide`) trong `messageIds`. */
  findHiddenMessageIds(userId: string, messageIds: string[]): Promise<Set<string>>;
  /** Tập id thật sự tồn tại VÀ thuộc đúng phạm vi — dùng kiểm tin gốc của reply thread. */
  findExistingMessageIds(scopeType: DiscoveryScopeType, scopeId: string, ids: string[]): Promise<Set<string>>;
}
