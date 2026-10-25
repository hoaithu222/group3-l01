/**
 * Kiểu DTO của `discovery` (p1-09) — khớp `be/src/modules/discovery/entities/discovery.interface.ts` và
 * `be/src/modules/messages/services/pins-query.service.ts` (đọc TRỰC TIẾP từ mã BE; be.md chỉ để tra nhanh).
 * Ngày tháng là chuỗi ISO qua JSON, không phải `Date`.
 */
import type { MessageView } from '@/features/chat';

export type DiscoveryScopeType = 'CHANNEL' | 'CONVERSATION';

/** Phạm vi đang tìm/xem ghim. `workspaceId` chỉ CÓ Ở KÊNH — route kênh nằm dưới `/workspaces/[wsId]/…` nên cần nó để mở lại tin. */
export interface DiscoveryScope {
  scopeType: DiscoveryScopeType;
  scopeId: string;
  workspaceId?: string;
}

/** `meta` của mọi danh sách cursor (`ResponseUtils.cursor`). */
export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface AttachmentsSummary {
  count: number;
  /** `IMAGE | VIDEO | AUDIO | VOICE | FILE` — để `string[]` vì BE không đóng kiểu này. */
  kinds: string[];
}

// ── Tin đã lưu (`GET /me/saved`) ─────────────────────────────────────────────

export interface SavedMessagePreview {
  id: string;
  authorId: string | null;
  authorName: string | null;
  /** BE luôn trả `null` ở P0 — dùng `Avatar name` (chữ viết tắt). */
  authorAvatarUrl: string | null;
  /** ≤ 160 grapheme, mention đã thay `@tên`; tin chỉ có tệp → `[Ảnh]`/`[Video]`/`[Tin nhắn thoại]`/`[Âm thanh]`/`[Tệp] tên`. */
  excerpt: string;
  attachmentsSummary: AttachmentsSummary;
  createdAt: string;
  /** id TIN GỐC của luồng (KHÔNG phải `Thread.id`); `null` với tin ngoài luồng. */
  threadId: string | null;
}

export interface SavedScopeInfo {
  type: DiscoveryScopeType;
  id: string;
  name: string;
  /** Chỉ hội thoại. */
  kind?: 'DIRECT' | 'GROUP';
  isPrivate: boolean;
}

export interface SavedAvailableItem {
  savedAt: string;
  messageId: string;
  scopeType: DiscoveryScopeType;
  scopeId: string;
  workspaceId: string | null;
  available: true;
  message: SavedMessagePreview;
  scope: SavedScopeInfo;
}

/** Thu hồi / mất quyền / bị ẩn / bị xoá — CHỈ có 3 trường, KHÔNG lộ nội dung hay tên phạm vi. */
export interface SavedUnavailableItem {
  savedAt: string;
  messageId: string;
  available: false;
}

export type SavedItem = SavedAvailableItem | SavedUnavailableItem;

export interface SavedPage {
  data: SavedItem[];
  meta: CursorMeta;
}

/** Query của `GET /me/saved` — `limit` mặc định 30, tối đa 100. */
export interface SavedListParams {
  scopeType?: DiscoveryScopeType;
  workspaceId?: string;
  cursor?: string;
  limit?: number;
}

// ── Tin đã ghim (`GET /scopes/:type/:id/pins`) ───────────────────────────────

/** `MessageView` (hợp đồng p1-04 giữ nguyên) + người ghim kèm tên. */
export interface PinnedItem extends MessageView {
  pinnedByUser: { id: string; name: string | null } | null;
}

export interface PinsMeta extends CursorMeta {
  /** Số tin ghim HIỆN CÓ (đã lọc tin ẩn phía người xem). */
  total: number;
  /** Trần ghim của phạm vi: 20 kênh / 10 hội thoại. */
  max: number;
}

export interface PinsPage {
  data: PinnedItem[];
  meta: PinsMeta;
}

// ── Tìm trong phạm vi (`GET /scopes/:type/:id/search`) ───────────────────────

export type SearchFileKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'FILE';

/** Vị trí theo UTF-16 CODE UNIT trong `snippet` — dùng thẳng với `String.prototype.slice`, không phải grapheme. */
export interface SearchHighlight {
  start: number;
  end: number;
}

export interface SearchHit {
  messageId: string;
  seq: number;
  /** id TIN GỐC của luồng (= `parentMessageId`), KHÔNG phải `Thread.id`; `null` với tin gốc/ngoài luồng. */
  threadId: string | null;
  parentMessageId: string | null;
  author: { id: string | null; name: string | null; avatarUrl: string | null };
  createdAt: string;
  /** Giữ dấu gốc; có `…` đầu/cuối khi bị cắt. */
  snippet: string;
  highlights: SearchHighlight[];
  attachmentsSummary: AttachmentsSummary | null;
  /** `true` = reply trong luồng → nhãn "Trong luồng". */
  inThread: boolean;
}

export interface SearchMeta extends CursorMeta {
  /** `true` = hết ngân sách thời gian phía server (2 s) — kết quả có thể chưa đầy đủ. */
  partial: boolean;
}

export interface SearchPage {
  data: SearchHit[];
  meta: SearchMeta;
}

/** Tham số gửi lên `GET …/search` (đã chuẩn hoá từ ô nhập + bộ lọc — xem `utils/search-params.ts`). */
export interface ScopeSearchParams {
  q: string;
  authorId?: string;
  /** ISO — đầu ngày (giờ máy). */
  from?: string;
  /** ISO — cuối ngày (giờ máy). */
  to?: string;
  hasFile?: boolean;
  fileKind?: SearchFileKind;
  /** Chỉ gửi khi `false` (mặc định server là `true`). */
  includeThreads?: boolean;
}

// ── Danh bạ người gửi + bộ lọc workspace ─────────────────────────────────────

export interface ScopeMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface WorkspaceOption {
  id: string;
  name: string;
}
