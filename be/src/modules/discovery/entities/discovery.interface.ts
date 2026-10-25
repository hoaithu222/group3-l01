/**
 * Entity domain của module `discovery` (p1-09) — khai ĐỘC LẬP với Prisma (cùng
 * giá trị enum), không import chéo kiểu từ `modules/messages` ngoài
 * `@modules/messages/public` (`.claude/rules/architecture.md`).
 */
import type { MessageScopeTypeValue } from "../../messages/public";

export type DiscoveryScopeType = MessageScopeTypeValue;

/** Bản ghi `SavedMessage` — chỉ tham chiếu, KHÔNG sao nội dung tin. */
export interface SavedMessageRecord {
  id: string;
  userId: string;
  messageId: string;
  scopeType: DiscoveryScopeType;
  scopeId: string;
  workspaceId: string | null;
  /** id TIN GỐC của thread (cùng nghĩa `Message.threadId`), null với tin ngoài thread. */
  threadId: string | null;
  createdAt: Date;
}

export interface SavedMessageCreateInput {
  userId: string;
  messageId: string;
  scopeType: DiscoveryScopeType;
  scopeId: string;
  workspaceId: string | null;
  threadId: string | null;
}

export interface SavedListParams {
  userId: string;
  scopeType?: DiscoveryScopeType;
  workspaceId?: string;
  /** Lấy các bản ghi CŨ HƠN `(at, id)` — sắp `createdAt desc, id desc`. */
  before?: { at: Date; id: string };
  /** Số bản ghi tối đa trả về (service truyền `limit + 1` để biết `hasMore`). */
  limit: number;
}

export interface MentionRef {
  type: string;
  targetId: string | null;
  label: string | null;
}

export interface AttachmentRef {
  kind: string;
  name: string;
}

/** Tin nhắn ở mức tối thiểu module `discovery` cần đọc (lưu/liệt kê/tìm) — KHÔNG có nội dung đã thu hồi. */
export interface DiscoveryMessage {
  id: string;
  scopeType: DiscoveryScopeType;
  scopeId: string;
  workspaceId: string | null;
  /** id TIN GỐC của thread; null với tin gốc/ngoài thread. */
  threadId: string | null;
  threadKey: string;
  seq: number;
  authorId: string | null;
  kind: "USER" | "SYSTEM" | "POLL";
  content: string | null;
  mentions: MentionRef[];
  attachments: AttachmentRef[];
  createdAt: Date;
  deletedAt: Date | null;
}

/** 1 dòng kết quả tìm — đã lọc tombstone ở truy vấn, `content` giữ NGUYÊN dấu gốc (marker mention chưa thay). */
export interface SearchRow {
  id: string;
  seq: number;
  threadId: string | null;
  authorId: string | null;
  createdAt: Date;
  content: string | null;
  mentions: MentionRef[];
  attachmentKinds: string[];
  deletedAt: Date | null;
}

export interface ChannelInfo {
  name: string;
  isPrivate: boolean;
}

export interface ConversationInfo {
  kind: "DIRECT" | "GROUP";
  /** Tên nhóm (GROUP); DIRECT: null. */
  title: string | null;
  /** DIRECT: tên người còn lại theo góc nhìn người xem. */
  peerName: string | null;
}

/** Tác giả tin tối thiểu: tên + ảnh (asset id thô — service đổi thành URL ký sẵn bằng `avatarUrlOf`). */
export interface DiscoveryUserBrief {
  name: string;
  avatarAssetId: string | null;
}

export interface MessagePreview {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  excerpt: string;
  attachmentsSummary: { count: number; kinds: string[] };
  createdAt: Date;
  threadId: string | null;
}

export interface SavedScopeInfo {
  type: DiscoveryScopeType;
  id: string;
  name: string;
  kind?: "DIRECT" | "GROUP";
  isPrivate: boolean;
}

export type SavedItem =
  | {
      savedAt: Date;
      messageId: string;
      scopeType: DiscoveryScopeType;
      scopeId: string;
      workspaceId: string | null;
      available: true;
      message: MessagePreview;
      scope: SavedScopeInfo;
    }
  | { savedAt: Date; messageId: string; available: false };

export interface SearchHighlight {
  /** Vị trí UTF-16 code unit trong `snippet` (không phải grapheme) — dùng thẳng với `String.prototype.slice`. */
  start: number;
  end: number;
}

export interface SearchHit {
  messageId: string;
  seq: number;
  /** id TIN GỐC của thread (= `parentMessageId`); null với tin gốc. */
  threadId: string | null;
  parentMessageId: string | null;
  author: { id: string | null; name: string | null; avatarUrl: string | null };
  createdAt: Date;
  snippet: string;
  highlights: SearchHighlight[];
  attachmentsSummary: { count: number; kinds: string[] } | null;
  inThread: boolean;
}

export interface SearchPageMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  partial: boolean;
}
