import type { AdvanceReadStateInput, ConversationAdvance, ThreadInfo } from "../entities/read-state.interface";

/** Ghi/đọc mốc đọc (be.md §5.1). Mọi thao tác "chỉ tăng" phải nguyên tử (`updateMany where lastReadSeq < seq`). */
export interface IReadStateRepository {
  findConversationLastSeq(conversationId: string): Promise<number | null>;
  findChannelInfo(channelId: string): Promise<{ workspaceId: string; lastSeq: number } | null>;
  /**
   * Nhận `Thread.id` HOẶC id tin gốc (`Message.threadId` = `Thread.parentMessageId`) — hai id này dễ nhầm ở client; ObjectId nên
   * không trùng nhau. Trả cả hai để nơi gọi chuẩn hoá: `ReadState.streamId` = `id`, `NotificationRecipient.streamKey` = `parentMessageId`.
   */
  findThreadInfo(threadIdOrRootMessageId: string): Promise<ThreadInfo | null>;

  /** CHANNEL/THREAD — `changed=false` khi mốc hiện tại ≥ `seq` (NT-03), trả mốc hiện tại. */
  advanceReadState(input: AdvanceReadStateInput): Promise<{ changed: boolean; lastReadSeq: number }>;

  /** CONVERSATION — `null` nếu không còn là member ACTIVE. Tính lại `unreadCount`/`mentionsSinceRead`, gỡ `markedUnread`. */
  advanceConversationMember(input: {
    conversationId: string;
    userId: string;
    seq: number;
    now: Date;
  }): Promise<ConversationAdvance | null>;

  /** Hội thoại còn chưa đọc (unreadCount>0 hoặc markedUnread) có `activityAt ≤ before`, kèm `lastSeq` hiện tại. */
  listUnreadConversationTargets(userId: string, before: Date): Promise<{ conversationId: string; lastSeq: number }[]>;

  /** `threadId → lastReadSeq` (thiếu = chưa có mốc). Dùng cho `ThreadView.myLastReadSeq`. */
  getThreadReadSeqs(userId: string, threadIds: string[]): Promise<Map<string, number>>;
}
