/**
 * Kiểu dữ liệu phân hệ Kiểm duyệt (p1-08) — khớp DTO THẬT của BE, không phải kế hoạch:
 * `be/src/modules/moderation/services/{admin-report-presenter,platform-moderation.service}.ts`,
 * `dtos/{admin-list-query,admin-action}.dto.ts`. Ngày giờ đi qua JSON là chuỗi ISO.
 */

/** `STUDY_SET` thêm ở p4-01 (BE `REPORT_TARGET_TYPES`); Phase sau còn COMPANY/JOB_OFFER (p6-08) nếu BE mở rộng. */
export type ReportTargetType =
  | 'MESSAGE'
  | 'USER'
  | 'CHANNEL'
  | 'CONVERSATION'
  | 'STUDY_SET'
  /** p6-03 — bài tìm cố vấn (bảng tin Mentor Connect), chỉ quản trị nền tảng xử lý. */
  | 'MENTOR_POST'
  /** p6-07 — trang portfolio công khai (`/p/<slug>`), chỉ quản trị nền tảng xử lý (gỡ/mở lại). */
  | 'PORTFOLIO'
  /** p6-08 — doanh nghiệp tuyển dụng (chỉ sinh viên từng nhận lời mời báo cáo được); nền tảng xử lý qua tạm ngưng doanh nghiệp. */
  | 'COMPANY'
  /** p6-08 — lời mời việc làm lạm dụng (chỉ sinh viên NHẬN báo cáo được); nền tảng xem nội dung lời mời bị báo cáo và thu hồi. */
  | 'JOB_OFFER';

/** `COPYRIGHT`/`WRONG_CONTENT` dành cho đích `STUDY_SET` (p4-01) nhưng nằm chung enum của BE. */
export type ReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'INAPPROPRIATE'
  | 'SCAM'
  | 'IMPERSONATION'
  | 'OTHER'
  | 'COPYRIGHT'
  | 'WRONG_CONTENT';

export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export type ReportResolution =
  | 'CONTENT_REMOVED'
  | 'AUTHOR_WARNED'
  | 'USER_LOCKED'
  | 'CHANNEL_ARCHIVED'
  | 'CONVERSATION_DISSOLVED'
  | 'NO_ACTION';

/** `SCOPE` = người kiểm duyệt trong phạm vi cũng xử lý được; `PLATFORM_ONLY` = chỉ nền tảng. */
export type ReportHandlerLevel = 'SCOPE' | 'PLATFORM_ONLY';

export type ReportScopeType = 'CHANNEL' | 'CONVERSATION';

/** BE chỉ nhận hai khoá sắp xếp, cả hai theo chiều GIẢM DẦN (không có tham số chiều). */
export type ReportSort = 'reportCount' | 'latest';

/** Hành động `PATCH /admin/reports/:reportId` (`adminActionSchema`). */
export type AdminReportAction =
  | 'DISMISS'
  | 'REMOVE_CONTENT'
  | 'WARN_AUTHOR'
  | 'LOCK_AUTHOR'
  | 'ARCHIVE_CHANNEL'
  | 'DISSOLVE_CONVERSATION';

/**
 * Một NHÓM báo cáo cùng đích (`AdminReportGroup`). CHỈ metadata: `scope.name` chỉ có với kênh
 * public (BE không trả tên kênh riêng tư/nhóm chat/1-1 ở hàng đợi).
 */
export interface AdminReportGroup {
  /** Báo cáo đại diện — dùng làm `:reportId` cho `GET/PATCH /admin/reports/:reportId`. */
  reportId: string;
  groupKey: string;
  targetType: ReportTargetType;
  targetId: string;
  reportCount: number;
  reasons: ReportReason[];
  workspace?: { id: string; name: string };
  scope: { type: ReportScopeType | null; isPrivate: boolean; name?: string };
  targetAuthor?: { id: string; name: string };
  firstAt: string;
  latestAt: string;
  status: ReportStatus;
  resolution: ReportResolution | null;
  handlerLevel: ReportHandlerLevel;
}

export interface AdminReportListParams {
  page: number;
  limit: number;
  /** BE mặc định `OPEN`; luôn gửi tường minh. */
  status: ReportStatus;
  targetType?: ReportTargetType;
  workspaceId?: string;
  reason?: ReportReason;
  /** ISO — đầu ngày (giờ máy người xem). */
  from?: string;
  /** ISO — cuối ngày. */
  to?: string;
  sort: ReportSort;
}

/** Một báo cáo lẻ trong nhóm — nền tảng thấy danh tính người báo cáo (README p1-08 §2). */
export interface ReportEntry {
  id: string;
  reporter: { id: string; name: string } | null;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
}

/** Báo cáo KHÁC cùng tác giả (BE loại nhóm hiện tại). `id` dùng được làm `:reportId`. */
export interface ReportHistoryItem {
  id: string;
  groupKey: string;
  targetType: ReportTargetType;
  reason: ReportReason;
  status: ReportStatus;
  resolution: ReportResolution | null;
  createdAt: string;
}

export interface ModerationAttachment {
  kind: string;
  name: string;
  mime: string;
}

/**
 * Tin ±3 cho người kiểm duyệt. `content` là `null` khi tin đã gỡ: BE xoá nội dung gốc lúc
 * tombstone (README p1-08 §10 "Tin đã gỡ trong D-06") — KHÔNG có bản gốc để hiện.
 */
export interface ModerationMessage {
  id: string;
  seq: number;
  authorId: string | null;
  authorName: string | null;
  kind: 'USER' | 'SYSTEM';
  content: string | null;
  attachments: ModerationAttachment[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  deletedAt: string | null;
  /** `true` = đúng tin bị báo cáo (các tin còn lại là ngữ cảnh). */
  isTarget: boolean;
}

export interface ReportDetail {
  group: AdminReportGroup;
  reports: ReportEntry[];
  /** CHỈ có với tin trong kênh public — kênh riêng tư/nhóm chat/1-1 phải qua luồng D-06. */
  publicContent?: ModerationMessage[];
  history: ReportHistoryItem[];
  authorStats: { reports30d: number; removed30d: number } | null;
}

/** `GET /admin/reports/:id/content` (D-06) — mỗi lần gọi BE ghi audit + thông báo người trong cuộc. */
export interface PrivateContent {
  messages: ModerationMessage[];
  scope: { type: ReportScopeType; id: string; name?: string };
  viewedAt: string;
  /** `null` khi báo cáo còn mở; ngược lại = mốc hết hạn quyền xem. */
  accessExpiresAt: string | null;
}

export interface ReportActionPayload {
  reportId: string;
  action: AdminReportAction;
  reason: string;
}

export interface ReportActionResult {
  groupKey: string;
  status: Exclude<ReportStatus, 'OPEN'>;
  resolution: ReportResolution;
  closedCount: number;
}

export interface RemoveMessagePayload {
  messageId: string;
  reason: string;
}

export interface RemoveMessageResult {
  messageId: string;
  deletedAt: string;
}

/** Lựa chọn cho ô lọc workspace — rút gọn từ `GET /admin/workspaces`. */
export interface WorkspaceOption {
  id: string;
  name: string;
}
