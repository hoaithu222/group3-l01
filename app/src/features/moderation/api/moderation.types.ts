/**
 * Kiểu DTO khớp `be/src/modules/moderation/**` + `be/src/modules/blocks/**` (đọc TRỰC TIẾP từ
 * đó — be.md/README p1-08 chỉ để tra nhanh, mã THẬT thắng tài liệu). Ngày tháng là chuỗi ISO
 * qua JSON, không phải `Date` (cùng quy ước `chat.types.ts`).
 *
 * ⛔ KHÔNG có `reporterId` ở BẤT KỲ kiểu nào dưới đây: người báo cáo ẩn danh với tác giả và
 * người kiểm duyệt phạm vi (MOD-08) — BE không trả, app không được bịa.
 */

export type ReportTargetType = 'MESSAGE' | 'USER' | 'CHANNEL' | 'CONVERSATION';
export type ReportReason = 'SPAM' | 'HARASSMENT' | 'INAPPROPRIATE' | 'SCAM' | 'IMPERSONATION' | 'OTHER';
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
export type ReportResolution =
  | 'CONTENT_REMOVED'
  | 'AUTHOR_WARNED'
  | 'USER_LOCKED'
  | 'CHANNEL_ARCHIVED'
  | 'CONVERSATION_DISSOLVED'
  | 'NO_ACTION';
/** Hành động người kiểm duyệt PHẠM VI được chọn (`POST /reports/:id/resolve`). */
export type ResolveAction = 'REMOVE_MESSAGE' | 'DISMISS' | 'WARN_AUTHOR';

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

// ── Báo cáo của tôi ───────────────────────────────────────────────────────────

/** `POST /reports` (`contextWorkspaceId` chỉ có nghĩa với `USER`). */
export interface CreateReportPayload {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
  contextWorkspaceId?: string;
}

/** 201 lần đầu, 200 lần sau (`alreadyReported: true`) — idempotent theo (người báo cáo, đích). */
export interface CreateReportResult {
  id: string;
  status: ReportStatus;
  createdAt: string;
  alreadyReported: boolean;
}

/** `GET /me/reports` — KHÔNG kèm nội dung đích. */
export interface MyReportItem {
  id: string;
  targetType: ReportTargetType;
  reason: ReportReason;
  status: ReportStatus;
  resolution: ReportResolution | null;
  createdAt: string;
}

// ── Hàng đợi phạm vi ──────────────────────────────────────────────────────────

export interface ScopeRef {
  type: 'CHANNEL' | 'CONVERSATION' | 'WORKSPACE';
  id: string;
  name?: string;
}

export interface ScopeReportPreview {
  authorName: string | null;
  excerpt: string;
  deleted: boolean;
}

/** Một NHÓM báo cáo cùng đích (`GET /workspaces/:id/reports`, `GET /conversations/:id/reports`). */
export interface ScopeReportItem {
  /** Báo cáo đại diện của nhóm — dùng làm `:reportId` cho `GET /reports/:id` và `/resolve`. */
  reportId: string;
  groupKey: string;
  targetType: ReportTargetType;
  targetId: string;
  reportCount: number;
  reasons: ReportReason[];
  latestAt: string;
  status: ReportStatus;
  resolution: ReportResolution | null;
  scope: ScopeRef | null;
  /** CHỈ có khi người xem ĐỌC được phạm vi của tin — vắng mặt thì hiện metadata, không hiện nội dung. */
  preview?: ScopeReportPreview;
}

export interface ScopeReportMyActions {
  canRemove: boolean;
  canDismiss: boolean;
  canWarn: boolean;
}

/** `GET /reports/:id` — người báo cáo thuần thấy báo cáo của mình với mọi action `false`. */
export interface ScopeReportDetail extends ScopeReportItem {
  myActions: ScopeReportMyActions;
}

export interface ResolveReportPayload {
  action: ResolveAction;
  /** 10–500 ký tự — ghi audit và hiện cho tác giả khi gỡ tin. */
  reason: string;
}

/** Đóng CẢ NHÓM `groupKey`. */
export interface ResolveReportResult {
  groupKey: string;
  status: Exclude<ReportStatus, 'OPEN'>;
  resolution: ReportResolution;
  closedCount: number;
}

/** Phạm vi của hàng đợi — quyết định endpoint. */
export type QueueScope = { type: 'WORKSPACE' | 'CONVERSATION'; id: string };

// ── Chặn ─────────────────────────────────────────────────────────────────────

export interface BlockedUser {
  userId: string;
  name: string;
  /** BE hiện luôn trả `null` (`BlocksService.list`) — vẫn khai để đổi phía BE không phải sửa kiểu. */
  avatarUrl: string | null;
  blockedAt: string;
}

export interface BlocksMeta extends CursorMeta {
  /** ≤ 500 id ĐẦY ĐỦ (mọi trang đều kèm) — nạp `useBlockedIds` mà không phải tải hết các trang. */
  allIds: string[];
}

export interface BlocksPage {
  data: BlockedUser[];
  meta: BlocksMeta;
}

/** `POST /me/blocks` — 201 mới, 200 nếu đã chặn từ trước. */
export interface BlockResult {
  userId: string;
  blockedAt: string;
}

/**
 * Payload `block:updated` — CHỈ tới `user:{blockerId}` (mọi thiết bị của NGƯỜI CHẶN). Đúng MỘT
 * trong `added`/`removed`. Áp dụng theo TẬP id (idempotent): phát lặp (retry outbox) vô hại.
 */
export interface BlockUpdatedPayload {
  v?: number;
  serverNow?: string;
  added?: string;
  removed?: string;
}
