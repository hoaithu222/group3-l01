/**
 * Khai ĐỘC LẬP với Prisma enum/model (cùng giá trị) — module không import
 * chéo kiểu Prisma thẳng vào tầng domain (`.claude/rules/architecture.md`),
 * giống `modules/channels/entities`/`modules/messages/entities`.
 */
export const THREAD_SUBSCRIPTION_STATES = ["AUTO_ON", "EXPLICIT_ON", "EXPLICIT_OFF"] as const;
export type ThreadSubscriptionStateValue = (typeof THREAD_SUBSCRIPTION_STATES)[number];

/** Entity domain — khớp model Prisma `Thread` (be.md §2). */
export interface Thread {
  id: string;
  workspaceId: string;
  channelId: string;
  parentMessageId: string;
  parentAuthorId: string | null;
  replyCount: number;
  lastReplySeq: number;
  lastReplyAt: Date | null;
  lastReplierIds: string[];
  subscriberCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Entity domain — khớp model Prisma `ThreadSubscription` (be.md §2). */
export interface ThreadSubscription {
  id: string;
  threadId: string;
  channelId: string;
  userId: string;
  state: ThreadSubscriptionStateValue;
  updatedAt: Date;
  createdAt: Date;
}

/** be.md §4 `ThreadView`. */
export interface ThreadView {
  id: string;
  channelId: string;
  parentMessageId: string;
  replyCount: number;
  lastReplyAt: Date | null;
  lastReplierIds: string[];
  mySubscription: ThreadSubscriptionStateValue | null;
  /**
   * p1-07 — `ReadState streamType THREAD` của tôi (`modules/read-state`, qua cổng `IReadStateReader` của
   * `core/permission`). `null` khi cổng chưa đăng ký (test cũ không boot `router.ts`); `0` khi chưa có mốc.
   * `unreadReplies` xấp xỉ theo seq: `max(0, lastReplySeq − myLastReadSeq)` (gồm cả reply của chính mình).
   */
  myLastReadSeq: number | null;
  unreadReplies: number;
}
