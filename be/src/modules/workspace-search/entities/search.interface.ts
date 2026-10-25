import type { AuthUser } from "../../../core/types/express";

/**
 * Entity/kết quả của module `workspace-search` (p5-04) — khai ĐỘC LẬP với Prisma, chỉ đọc (module không ghi gì).
 */

export type SearchScopeType = "CHANNEL" | "CONVERSATION";

export interface SearchScopeRef {
  type: SearchScopeType;
  id: string;
}

// ── Tập scope đọc được (`ReadableScopesService`) ─────────────────────────────

export interface ReadableChannel {
  id: string;
  name: string;
  normalizedName: string;
  type: string;
  visibility: "PUBLIC" | "PRIVATE";
  status: "ACTIVE" | "ARCHIVED";
  memberCount: number;
  lastActivityAt: Date | null;
}

export interface ReadableConversation {
  id: string;
  kind: "GROUP" | "DIRECT";
  title: string | null;
  /** DIRECT: người còn lại. */
  peerUserId: string | null;
  /** D-23 — chỉ tin gốc `seq > hiddenBeforeSeq` hiện với người này. */
  hiddenBeforeSeq: number;
  lastActivityAt: Date | null;
}

export interface ReadableScopes {
  channels: Map<string, ReadableChannel>;
  conversations: Map<string, ReadableConversation>;
  /** Có scope đọc được bị cắt vì vượt `LIMITS.search.workspaceScopesMax` (giữ nơi hoạt động gần nhất). */
  truncated: boolean;
}

export interface ComputeScopesInput {
  userId: string;
  workspaceId: string;
  /** Vai trò workspace của người tìm (`OWNER|ADMIN|MEMBER|GUEST`). */
  role: string | null;
  /** Gồm hội thoại 1-1 (bỏ qua với khách). */
  includeDirect: boolean;
  /** Chỉ tính các scope này (lọc theo phạm vi / kiểm lại kết quả) — không cắt theo trần. */
  only?: readonly SearchScopeRef[];
  /** Mặc định cả hai; `false` bỏ hẳn nhóm đó (tìm kênh không cần hội thoại). */
  withChannels?: boolean;
  withConversations?: boolean;
  /** Trần số scope; mặc định `LIMITS.search.workspaceScopesMax`. */
  max?: number;
}

// ── Kết quả từng loại ────────────────────────────────────────────────────────

export interface SearchHighlight {
  start: number;
  end: number;
}

export interface MessageScopeInfo {
  type: SearchScopeType;
  id: string;
  /** DIRECT: tên đối phương. */
  name: string | null;
  isPrivate: boolean;
}

export interface SearchAuthor {
  id: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface MessageHit {
  messageId: string;
  seq: number;
  scope: MessageScopeInfo;
  /** id TIN GỐC của thread (null với tin gốc). */
  threadId: string | null;
  parentMessageId: string | null;
  inThread: boolean;
  author: SearchAuthor;
  snippet: string;
  highlights: SearchHighlight[];
  createdAt: Date;
  hasAttachments: boolean;
}

export interface FileHit {
  assetId: string;
  name: string;
  mime: string;
  size: number;
  kind: string;
  source: {
    kind: "MESSAGE" | "RESOURCE";
    messageId?: string;
    resourceId?: string;
    /**
     * Chỉ với nguồn MESSAGE: id TIN GỐC của luồng khi tệp nằm trong một reply (`Message.threadId`, cùng nghĩa `MessageHit.threadId`),
     * `null` khi tệp ở tin gốc/dòng chính của kênh — client mở reply bằng màn luồng của tin gốc này thay vì dòng chính.
     */
    threadId?: string | null;
    scope?: MessageScopeInfo;
  };
  createdAt: Date;
}

export interface ChannelHit {
  channelId: string;
  name: string;
  type: string;
  visibility: "PUBLIC" | "PRIVATE";
  status: "ACTIVE" | "ARCHIVED";
  joined: boolean;
  /** Khách không thấy số thành viên. */
  memberCount?: number;
}

export interface PersonHit {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  presence: string;
}

export interface MeetingHit {
  meetingId: string;
  code: string;
  title: string;
  startAt: Date;
  endAt: Date;
  status: string;
  isAttendee: boolean;
}

export interface SearchPageMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  /** Hết ngân sách thời gian giữa chừng — chỉ có phần mới hơn (không lỗi). */
  partial: boolean;
  /** Vượt trần scope — chỉ tìm ở nơi hoạt động gần nhất. */
  truncated: boolean;
}

export interface SearchPage<T> {
  data: T[];
  meta: SearchPageMeta;
}

/** Điểm chung cho mọi searcher — nhận từ khoá đã tách + ngữ cảnh người tìm. */
export interface SearchContext {
  user: AuthUser;
  userId: string;
  workspaceId: string;
  role: string | null;
  isGuest: boolean;
  tokens: readonly string[];
  regexes: readonly string[];
}
