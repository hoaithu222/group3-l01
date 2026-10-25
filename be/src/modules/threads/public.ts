/**
 * Barrel CÔNG KHAI của module `threads` (p1-06) — cùng cơ chế
 * `@modules/messages/public`/`@modules/channels`/`@modules/conversations/public`.
 *
 * `listThreadSubscribers()` cài đặt hợp đồng be.md §5.4
 * "`IThreadSubscriberReader.list(threadId, cursor)`" cho p1-07 (fan-out
 * thông báo reply tới người theo dõi thread) GỌI VÀO module này — p1-07 CHƯA
 * build nên CHƯA có nơi gọi thật; export 1 hàm thuần (không phải
 * registry/port, đúng cách p1-05 xử lý `emitReadReceipt()` cho khoảng trống
 * tương tự) vì đây là module CUNG CẤP dữ liệu cho caller tương lai, không
 * phải module GỌI RA ngoài — không cần trừu tượng hoá thêm cho 1 caller còn
 * chưa tồn tại.
 */
import { PrismaThreadSubscriptionRepository } from "./repositories/thread-subscription.repository.prisma";
import type { ThreadSubscriptionStateValue } from "./entities/thread.interface";

const subscriptionRepo = new PrismaThreadSubscriptionRepository();

export interface ThreadSubscriberEntry {
  userId: string;
  state: ThreadSubscriptionStateValue;
}

export interface ListThreadSubscribersResult {
  data: ThreadSubscriberEntry[];
  nextCursor: string | null;
}

/**
 * `AUTO_ON`/`EXPLICIT_ON` (trừ `EXPLICIT_OFF`), phân trang 500/lô (README p1-06
 * §10 "fan-out chia lô 500"), loại trừ `excludeUserId` (tác giả reply vừa gửi
 * — không tự thông báo cho mình, be.md §5.4).
 */
export async function listThreadSubscribers(
  threadId: string,
  cursor?: string | null,
  excludeUserId?: string
): Promise<ListThreadSubscribersResult> {
  return subscriptionRepo.listActiveSubscribers(threadId, { cursor, limit: 500, excludeUserId });
}

export type { ThreadSubscriptionStateValue } from "./entities/thread.interface";
export type { Thread, ThreadView } from "./entities/thread.interface";
