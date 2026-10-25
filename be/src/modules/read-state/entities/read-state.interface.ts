/** p1-07 be.md §2 — luồng có mốc đọc. CHANNEL/THREAD lưu ở `ReadState`; CONVERSATION ở `ConversationMember.lastReadSeq`. */
export const READ_STREAM_TYPES = ["CHANNEL", "THREAD", "CONVERSATION"] as const;
export type ReadStreamTypeValue = (typeof READ_STREAM_TYPES)[number];

/** Luồng đã resolve (đã kiểm quyền đọc) — đầu vào cho ghi mốc/đánh dấu hộp thư. */
export interface ResolvedStream {
  streamType: ReadStreamTypeValue;
  streamId: string;
  /** Scope chứa tin: THREAD → kênh chứa thread. */
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  workspaceId: string | null;
  channelId: string | null;
  /** `Channel.lastSeq` / `Conversation.lastSeq` / `Thread.lastReplySeq`. */
  lastSeq: number;
  /** `"root"` | threadId — khớp `NotificationRecipient.streamKey`. */
  streamKey: string;
}

/** Thread ở mức đủ để đặt mốc đọc (xem `IReadStateRepository.findThreadInfo`). */
export interface ThreadInfo {
  /** `Thread.id` — khoá `ReadState { THREAD }`. */
  id: string;
  /** `Thread.parentMessageId` = `Message.threadId` — khoá luồng của `NotificationRecipient.streamKey`. */
  parentMessageId: string;
  workspaceId: string;
  channelId: string;
  lastReplySeq: number;
}

export interface MarkResult {
  streamType: ReadStreamTypeValue;
  streamId: string;
  lastReadSeq: number;
  changed: boolean;
}

/** Kết quả nâng mốc đọc hội thoại — kèm số liệu phi chuẩn hoá mới để phát `read:updated`. */
export interface ConversationAdvance {
  changed: boolean;
  lastReadSeq: number;
  unreadCount: number;
  mentionCount: number;
}

export interface AdvanceReadStateInput {
  userId: string;
  streamType: "CHANNEL" | "THREAD";
  streamId: string;
  workspaceId: string;
  channelId: string;
  seq: number;
  now: Date;
}

export interface ConversationUnreadRow {
  unreadCount: number;
  markedUnread: boolean;
  mentionsSinceRead: number;
  notifyMode: string;
  mutedUntil: Date | null;
}

export interface JoinedChannelRow {
  channelId: string;
  workspaceId: string;
  lastSeq: number;
  notifyMode: string;
}

/** Nhóm ACTIVE của người dùng kèm `notifyMode` (`WorkspaceMembership.notifyMode`) — kênh INHERIT của một
 *  nhóm MUTED không tính vào `unreadChannels` (`UnreadService.summary`), cùng cách kênh MUTED riêng lẻ bị loại. */
export interface ActiveWorkspaceRow {
  workspaceId: string;
  notifyMode: string;
}

export interface SubscribedThreadRow {
  threadId: string;
  channelId: string;
  lastReplySeq: number;
}

export interface InboxCounts {
  unread: number;
  mentions: number;
  mentionsByWorkspace: Map<string, number>;
}

/** `GET /me/unread/summary` (be.md §4). */
export interface UnreadSummary {
  conversations: { unreadConversations: number; unreadMessages: number; mentions: number };
  workspaces: { workspaceId: string; unreadChannels: number; mentions: number }[];
  activity: { unread: number; mentions: number };
  badgeTotal: number;
  computedAt: string;
}

/**
 * `GET /me/unread?workspaceId=` (be.md §4). `capped=true` ↔ hiển thị "100+".
 * `lastReadSeq` = mốc đã đọc của người dùng (0 = chưa đọc gì) — app vẽ đường kẻ "Tin chưa đọc" trước tin đầu tiên có `seq > lastReadSeq`
 * (suy ngược từ số đếm sẽ sai vì số đếm bỏ tin của chính mình/tin đã xoá). `threads[id].lastSeq` = seq reply mới nhất của thread.
 */
export interface WorkspaceUnread {
  channels: Record<string, { unread: number; mentions: number; lastSeq: number; capped: boolean; lastReadSeq: number }>;
  threads: Record<string, { unread: number; channelId: string; lastSeq: number; lastReadSeq: number }>;
}
