/**
 * Kiểu DTO của "Tìm toàn workspace" (p5-04) — khớp `be/src/modules/workspace-search/entities/search.interface.ts` và
 * `dtos/search-query.dto.ts` (đọc TRỰC TIẾP từ mã BE; be.md chỉ để tra nhanh). Ngày tháng là chuỗi ISO qua JSON.
 *
 * ⚠️ Lệch nhỏ so với app.md: `highlights` là mảng OBJECT `{ start, end }` (như `SearchHit` của p1-09), không phải mảng cặp;
 * người/avatar tên trường là `avatarUrl` (đồng bộ với p1-09), không phải `avatar`.
 */
import type { TextHighlight } from '@/shared/search';

export type WorkspaceSearchType = 'messages' | 'files' | 'channels' | 'people' | 'meetings';
export type SearchScopeType = 'CHANNEL' | 'CONVERSATION';

export interface SearchScopeInfo {
  type: SearchScopeType;
  id: string;
  /** Hội thoại 1-1: tên đối phương. `null` khi không tra được. */
  name: string | null;
  isPrivate: boolean;
}

export interface MessageHit {
  messageId: string;
  seq: number;
  scope: SearchScopeInfo;
  /** id TIN GỐC của luồng (= `parentMessageId`), KHÔNG phải `Thread.id`; `null` với tin gốc. */
  threadId: string | null;
  parentMessageId: string | null;
  inThread: boolean;
  author: { id: string | null; name: string | null; avatarUrl: string | null };
  /** Giữ dấu gốc; có `…` đầu/cuối khi bị cắt. */
  snippet: string;
  /** Vị trí theo UTF-16 CODE UNIT trong `snippet`. */
  highlights: TextHighlight[];
  createdAt: string;
  hasAttachments: boolean;
}

export interface FileHit {
  assetId: string;
  name: string;
  mime: string;
  size: number;
  /** `IMAGE | VIDEO | AUDIO | VOICE | FILE` với tệp của tin; loại tài liệu (`PDF`, `DOC`…) với tệp kho tài liệu. */
  kind: string;
  source: {
    kind: 'MESSAGE' | 'RESOURCE';
    messageId?: string;
    resourceId?: string;
    /**
     * Chỉ với tệp của TIN: id TIN GỐC của luồng khi tệp nằm trong một reply (cùng nghĩa `MessageHit.threadId`), `null` khi ở
     * dòng chính. BE cũ chưa trả trường này (vắng mặt) — coi như dòng chính.
     */
    threadId?: string | null;
    /** Chỉ có với tệp của TIN. */
    scope?: SearchScopeInfo;
  };
  createdAt: string;
}

export interface ChannelHit {
  channelId: string;
  name: string;
  type: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'ACTIVE' | 'ARCHIVED';
  joined: boolean;
  /** Khách không thấy số thành viên. */
  memberCount?: number;
}

export interface PersonHit {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  /** `ONLINE | AWAY | DND | OFFLINE | HIDDEN` — BE không đóng kiểu này nên để `string`. */
  presence: string;
}

export interface MeetingHit {
  meetingId: string;
  code: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  isAttendee: boolean;
}

/** Một dòng kết quả đã gắn loại — để `renderItem` rẽ nhánh không phải ép kiểu. */
export type SearchRow =
  | { type: 'messages'; key: string; hit: MessageHit }
  | { type: 'files'; key: string; hit: FileHit }
  | { type: 'channels'; key: string; hit: ChannelHit }
  | { type: 'people'; key: string; hit: PersonHit }
  | { type: 'meetings'; key: string; hit: MeetingHit };

/** `meta` cursor chuẩn + hai cờ mở rộng của tìm toàn nhóm. Không có `total` (BE không đếm chính xác). */
export interface WorkspaceSearchMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  /** Hết ngân sách thời gian giữa chừng — kết quả có thể chưa đầy đủ. */
  partial: boolean;
  /** Vượt trần số kênh/hội thoại (200): chỉ tìm ở nơi hoạt động gần nhất. */
  truncated: boolean;
}

export interface WorkspaceSearchPage {
  data: SearchRow[];
  meta: WorkspaceSearchMeta;
}

/** Tham số ĐÃ chuẩn hoá của `GET /workspaces/:id/search` (từ ô nhập + bộ lọc — xem `utils/search-params.ts`). */
export interface WorkspaceSearchParams {
  q: string;
  type: WorkspaceSearchType;
  authorId?: string;
  /** ISO — đầu ngày (giờ máy). */
  from?: string;
  /** ISO — cuối ngày (giờ máy). */
  to?: string;
  hasFile?: boolean;
  /** `scopeType` và `scopeId` luôn đi CẶP. */
  scopeType?: SearchScopeType;
  scopeId?: string;
  /** Chỉ gửi khi `true` (mặc định server là `false`). */
  includeDirect?: boolean;
}

export type WorkspaceSearchRequest = WorkspaceSearchParams & { cursor?: string; limit?: number };

// ── Danh sách cho bộ lọc ─────────────────────────────────────────────────────

export interface SearchAuthorOption {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface SearchScopeOption {
  type: SearchScopeType;
  id: string;
  name: string;
  isPrivate: boolean;
}

export type SearchWorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

/** Phần của `GET /workspaces/:id` mà tìm kiếm đọc — kiểu HẸP trên cùng phản hồi đầy đủ (xem `getWorkspaceHead`). */
export interface SearchWorkspaceHead {
  myRole: SearchWorkspaceRole;
  status: 'ACTIVE' | 'ARCHIVED';
}
