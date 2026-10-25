import type { MessageView } from '@/features/chat';

/**
 * Kiểu DTO khớp `be/src/modules/threads/entities/thread.interface.ts` (đọc TRỰC TIẾP từ đó — be.md
 * §4 chỉ để tra nhanh). Ngày tháng là chuỗi ISO qua JSON, không phải `Date`.
 */
export type ThreadSubscriptionState = 'AUTO_ON' | 'EXPLICIT_ON' | 'EXPLICIT_OFF';

/**
 * `myLastReadSeq`/`unreadReplies`: BE điền từ ReadState `THREAD` (p1-07) nhưng `unreadReplies` chỉ là số XẤP XỈ theo seq (gồm cả reply của chính mình) — UI KHÔNG dùng hai trường này mà đọc số chưa
 * đọc chuẩn từ `GET /me/unread` qua `useThreadUnread` (`@/shared/notifications`, khoá bằng `ThreadView.id`), cùng nguồn với chấm "N mới" dưới tin gốc và huy hiệu kênh.
 */
export interface ThreadView {
  id: string;
  channelId: string;
  parentMessageId: string;
  replyCount: number;
  lastReplyAt: string | null;
  lastReplierIds: string[];
  mySubscription: ThreadSubscriptionState | null;
  myLastReadSeq: number | null;
  unreadReplies: number;
}

/** `GET /channels/:id/threads?filter=` — `following` (mặc định của BE) chỉ luồng tôi đang theo dõi (`AUTO_ON`/`EXPLICIT_ON`); `all` mọi luồng của kênh. */
export type ThreadListFilter = 'following' | 'all';

/** Trang cursor của `GET /channels/:id/threads` (BE `ThreadListResult`); `nextCursor` là chuỗi mờ — chỉ gửi lại nguyên văn. */
export interface ThreadListPage {
  data: ThreadView[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

/** `GET /messages/:id/thread` — `thread` là `null` khi tin gốc CHƯA có phản hồi nào (TH-02: mở màn không tạo luồng). */
export interface ThreadRootResult {
  root: MessageView;
  thread: ThreadView | null;
}

export interface ThreadSubscriptionResult {
  threadId: string;
  state: ThreadSubscriptionState;
}

/** `thread:subscription-updated` (room `user:{id}`) — đồng bộ theo dõi đa thiết bị. */
export interface ThreadSubscriptionUpdatedEvent {
  threadId: string;
  state: ThreadSubscriptionState;
}

/** Một người trong danh bạ kênh — chỉ phần `resolveAuthor` cần (tên + ảnh). */
export interface ThreadAuthorSource {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface ThreadAuthorPage {
  items: ThreadAuthorSource[];
  page: number;
  hasNext: boolean;
}

/**
 * Lát `GET /channels/:id` màn luồng cần: tên (tiêu đề) và quyền gửi (composer). Gọi thẳng endpoint của
 * `channels` mà KHÔNG import feature đó (`feature-structure.md`) — cùng mẫu `chatService.searchPeople`.
 */
export interface ThreadChannelBrief {
  id: string;
  name: string;
  myPermissions: { canWrite: boolean };
}
