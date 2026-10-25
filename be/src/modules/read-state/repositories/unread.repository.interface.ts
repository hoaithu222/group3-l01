import type {
  ActiveWorkspaceRow,
  ConversationUnreadRow,
  InboxCounts,
  JoinedChannelRow,
  SubscribedThreadRow,
} from "../entities/read-state.interface";

/** Đọc số liệu để tính chưa đọc (be.md §5.2) — chỉ đọc, không ghi. */
export interface IUnreadRepository {
  /** Hội thoại có dấu chưa đọc (unreadCount>0 | markedUnread | mentionsSinceRead>0) của member ACTIVE chưa lưu trữ. */
  conversationRows(userId: string): Promise<ConversationUnreadRow[]>;
  /** Workspace ACTIVE của người dùng (tối đa `limit`) kèm `notifyMode` (mute cả nhóm). */
  activeWorkspaceIds(userId: string, limit: number): Promise<ActiveWorkspaceRow[]>;
  /** Kênh ACTIVE đã tham gia (`ChannelMembership`) trong các workspace — kèm `lastSeq`/`notifyMode`. */
  joinedChannels(userId: string, workspaceIds: string[]): Promise<JoinedChannelRow[]>;
  /** `streamId → lastReadSeq` (thiếu = chưa có mốc). */
  readSeqs(userId: string, streamType: "CHANNEL" | "THREAD", streamIds: string[]): Promise<Map<string, number>>;
  /** Mục hộp thư Hoạt động chưa đọc (unread/mentions + mention theo workspace). */
  inboxCounts(userId: string): Promise<InboxCounts>;
  /** Đếm tối đa `cap` tin gốc chưa đọc (seq > afterSeq, tác giả ≠ người dùng, chưa xoá) của 1 kênh. */
  countChannelUnread(userId: string, channelId: string, afterSeq: number, cap: number): Promise<number>;
  /** `channelId → số mục MENTION chưa đọc` trong 1 workspace. */
  channelMentionCounts(userId: string, workspaceId: string): Promise<Map<string, number>>;
  /** Thread người dùng đang theo dõi (`AUTO_ON`/`EXPLICIT_ON`) trong các kênh của workspace. */
  subscribedThreads(userId: string, workspaceId: string): Promise<SubscribedThreadRow[]>;
}
