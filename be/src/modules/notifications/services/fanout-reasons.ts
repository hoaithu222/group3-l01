import { REASON_RANK, type FanoutReason } from "../entities/message-notification.types";

export interface ReasonSets {
  /** Người bị nhắc tên (USER) — đã loại tác giả; `mentionAll` xử lý riêng vì cần audience. */
  mentionUserIds: ReadonlySet<string>;
  mentionAll: boolean;
  /** Người theo dõi thread (state ON) — chỉ có khi tin là reply trong thread. */
  threadSubscriberIds: ReadonlySet<string>;
  /** Tác giả tin gốc, chỉ khi đây là reply ĐẦU TIÊN của thread. */
  firstReplyUserId: string | null;
}

/**
 * Lý do 1 người nhận được sự chú ý (be.md §5.4 bước 3): MENTION nếu bị nhắc (kể cả qua `@all`) ·
 * FIRST_REPLY nếu là tác giả tin gốc của thread vừa có reply đầu · THREAD_REPLY nếu theo dõi thread ·
 * ngược lại MESSAGE. Chỉ tính cho người TRONG audience — nơi gọi lọc trước.
 */
export function reasonFor(userId: string, sets: ReasonSets): FanoutReason {
  if (sets.mentionAll || sets.mentionUserIds.has(userId)) return "MENTION";
  if (sets.firstReplyUserId === userId) return "FIRST_REPLY";
  if (sets.threadSubscriberIds.has(userId)) return "THREAD_REPLY";
  return "MESSAGE";
}

/** Lý do cao hơn (theo `REASON_RANK`) — dùng khi gộp nhiều tin cùng cửa sổ push. */
export function maxReason(a: FanoutReason, b: FanoutReason): FanoutReason {
  return REASON_RANK[a] >= REASON_RANK[b] ? a : b;
}
