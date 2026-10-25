/**
 * Kiểu DTO của hộp thư "Hoạt động" — `GET/POST /notifications*` (p1-07 `be.md` §15.2–§15.3), đối chiếu
 * `be/src/modules/notifications/{entities/notification.interface.ts,dtos/list-notifications.dto.ts}`.
 * Ngày là chuỗi ISO qua JSON.
 */

/** Bộ lọc hộp thư. App chỉ có tab `all`/`mentions`/`following`; `calls`/`meetings` dành cho Phase 2. */
export type InboxFilter = 'all' | 'calls' | 'following' | 'meetings' | 'mentions';

/** Nhãn phân loại — chỉ để gắn chữ; KHOÁ ĐIỀU HƯỚNG là `type`, không phải `kind`. */
export type InboxKind =
  | 'DEFAULT'
  | 'FIRST_REPLY'
  | 'MENTION'
  | 'MENTION_ROLE'
  | 'TASK_COMMENT'
  | 'TASK_COMMENT_MENTION'
  | 'THREAD_REPLY';

export type InboxScopeType = 'CALL' | 'CHANNEL' | 'CONVERSATION' | 'MEETING' | 'NONE' | 'WORKSPACE';

/**
 * Ngữ cảnh TÍNH LÚC ĐỌC, kiểm quyền hiện tại. `available=false` → hiện "Nội dung không còn khả dụng":
 * KHÔNG có `scopeName`/`excerpt` (⛔ đừng in tên kênh/nhóm cũ — UX riêng p1-07 §7).
 */
export interface InboxItemContext {
  available: boolean;
  excerpt?: string;
  muted: boolean;
  scopeName?: string;
}

/** id tham chiếu để điều hướng — chỉ id, không nội dung. Khoá có mặt tuỳ `type`. */
export type InboxRefs = Record<string, unknown> & {
  boardId?: string;
  commentId?: string;
  meetingId?: string;
  messageId?: string;
  seq?: number;
  taskId?: string;
  threadId?: string;
  workspaceId?: string;
};

export interface InboxActor {
  avatarUrl: string | null;
  name: string;
  userId: string;
}

export interface InboxItem {
  actor?: InboxActor | null;
  actorId: string | null;
  context?: InboxItemContext;
  createdAt: string;
  /** id mục của NGƯỜI NHẬN — dùng cho `POST /notifications/:id/read` và khớp `notification:created.id`. */
  id: string;
  kind: InboxKind | (string & {});
  /** `threadId` (rút từ `refs`) là id TIN GỐC của luồng — KHÔNG phải `Thread.id`. */
  messageId?: string | null;
  /** Cài đặt hiệu lực đang tắt tiếng → nhãn "Đã tắt tiếng". */
  muted: boolean;
  readAt: string | null;
  refs: InboxRefs | null;
  scopeId: string | null;
  scopeType: InboxScopeType;
  threadId?: string | null;
  /** "mention" | "thread.reply" | "task.assigned" | "meeting.invited" | … — KHOÁ ĐIỀU HƯỚNG phía app. */
  type: string;
  /** Mất quyền: `refs`/`scopeId`/`actorId` đã bị BE xoá. */
  unavailable: boolean;
  workspaceId: string | null;
}

export interface InboxCursorMeta {
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
}

export interface InboxPage {
  data: InboxItem[];
  meta: InboxCursorMeta;
}

export interface ListInboxParams {
  cursor?: string;
  filter: InboxFilter;
  limit?: number;
  unreadOnly?: boolean;
  workspaceId?: string;
}

/** `GET /notifications/unread-count` */
export interface InboxUnreadCount {
  byFilter: { calls: number; following: number; meetings: number; mentions: number };
  total: number;
}

export interface ReadAllInboxPayload {
  /** Thời điểm client tải danh sách — mục tới SAU đó vẫn chưa đọc (NT-13). */
  before: string;
  filter: InboxFilter;
  workspaceId?: string;
}

/** `notification:created` (room `user:{me}`); đường `deliver.recipient` thêm `notificationId`/`type`/`refs`. */
export interface NotificationCreatedEvent {
  createdAt: string;
  id: string;
  kind: string;
  messageId?: string;
  notificationId?: string;
  refs?: InboxRefs;
  scopeId?: string;
  scopeType?: InboxScopeType;
  threadId?: string;
  type?: string;
  workspaceId?: string;
}

/** `notification:read`: `{ ids }` hoặc `{ all: { filter, workspaceId?, before } }` (be.md §13 #12). */
export type NotificationReadEvent =
  | { all: { before: string; filter: InboxFilter; workspaceId?: string }; ids?: undefined }
  | { all?: undefined; ids: string[] };
