import type { SystemIconName } from '@/shared/ui';
import { statusBadge } from '@/shared/utils/format';

import type {
  AdminReportAction,
  ReportHandlerLevel,
  ReportReason,
  ReportResolution,
  ReportSort,
  ReportStatus,
  ReportTargetType,
} from '../types/moderation.types';

/**
 * Gốc đường dẫn của phân hệ — viết thẳng chuỗi, KHÔNG import `MODULE_PATHS`: trang của phân hệ
 * do chính registry lazy-load, import ngược `module-registry` khép vòng (`check:cycles`), cùng lý
 * do đã ghi ở `audit-target-href.ts`. Khớp `moderation.routes.tsx`.
 */
export const MODERATION_BASE_PATH = '/moderation';

/** Ngày trong URL (`?from=&to=`) — cùng dạng với các bộ lọc khoảng ngày khác của admin. */
export const REPORT_URL_DATE_FORMAT = 'YYYY-MM-DD';

/** ObjectId 24 hex — `workspaceId` sai định dạng thì BE trả 400, không nên bắn request. */
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const DEFAULT_REPORT_STATUS: ReportStatus = 'OPEN';
export const DEFAULT_REPORT_SORT: ReportSort = 'reportCount';

export const REPORT_STATUSES: readonly ReportStatus[] = ['OPEN', 'RESOLVED', 'DISMISSED'];
export const REPORT_SORTS: readonly ReportSort[] = ['reportCount', 'latest'];

export const REPORT_TARGET_TYPE_LABEL: Readonly<Record<ReportTargetType, string>> = {
  MESSAGE: 'Tin nhắn',
  USER: 'Người dùng',
  CHANNEL: 'Kênh',
  CONVERSATION: 'Nhóm chat',
  STUDY_SET: 'Bộ học',
  MENTOR_POST: 'Bài tìm cố vấn',
  PORTFOLIO: 'Portfolio',
  COMPANY: 'Doanh nghiệp',
  JOB_OFFER: 'Lời mời việc làm',
};

export const REPORT_TARGET_TYPES = Object.keys(REPORT_TARGET_TYPE_LABEL) as ReportTargetType[];

export const REPORT_REASON_LABEL: Readonly<Record<ReportReason, string>> = {
  SPAM: 'Spam',
  HARASSMENT: 'Quấy rối',
  INAPPROPRIATE: 'Nội dung không phù hợp',
  SCAM: 'Lừa đảo',
  IMPERSONATION: 'Mạo danh',
  OTHER: 'Khác',
  COPYRIGHT: 'Vi phạm bản quyền',
  WRONG_CONTENT: 'Nội dung sai',
};

export const REPORT_REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];

export const REPORT_RESOLUTION_LABEL: Readonly<Record<ReportResolution, string>> = {
  CONTENT_REMOVED: 'Đã gỡ nội dung',
  AUTHOR_WARNED: 'Đã cảnh cáo tác giả',
  USER_LOCKED: 'Đã khoá tài khoản',
  CHANNEL_ARCHIVED: 'Đã lưu trữ kênh',
  CONVERSATION_DISSOLVED: 'Đã giải tán nhóm chat',
  NO_ACTION: 'Không xử lý thêm',
};

export const REPORT_HANDLER_LEVEL_LABEL: Readonly<Record<ReportHandlerLevel, string>> = {
  SCOPE: 'Người kiểm duyệt phạm vi và nền tảng',
  PLATFORM_ONLY: 'Chỉ nền tảng',
};

/** Nhãn trạng thái lấy từ `statusBadge('report')` — một nguồn với mọi bảng khác. */
export const REPORT_STATUS_OPTIONS = REPORT_STATUSES.map((value) => ({
  value,
  label: statusBadge('report', value).label,
}));

export const REPORT_TARGET_TYPE_OPTIONS = REPORT_TARGET_TYPES.map((value) => ({
  value,
  label: REPORT_TARGET_TYPE_LABEL[value],
}));

export const REPORT_REASON_OPTIONS = REPORT_REASONS.map((value) => ({
  value,
  label: REPORT_REASON_LABEL[value],
}));

/** BE chỉ có hai khoá, cùng chiều giảm dần — nên là ô chọn, không phải mũi tên sắp xếp trên cột. */
export const REPORT_SORT_OPTIONS: ReadonlyArray<{ value: ReportSort; label: string }> = [
  { value: 'reportCount', label: 'Nhiều báo cáo nhất' },
  { value: 'latest', label: 'Mới nhất' },
];

export interface AdminActionMeta {
  label: string;
  icon: SystemIconName;
  /** Nhãn nút xác nhận trong hộp thoại lý do. */
  confirmLabel: string;
  /** Tác động — hiện trong `ConfirmWithReasonModal`. */
  impact: string;
  danger: boolean;
}

export const ADMIN_ACTION_META: Readonly<Record<AdminReportAction, AdminActionMeta>> = {
  REMOVE_CONTENT: {
    label: 'Gỡ nội dung',
    icon: 'trash-can-outline',
    confirmLabel: 'Gỡ nội dung',
    impact: 'Tin hiển thị là đã bị gỡ với mọi người; tác giả được thông báo.',
    danger: true,
  },
  WARN_AUTHOR: {
    label: 'Cảnh cáo tác giả',
    icon: 'triangle-exclamation-outline',
    confirmLabel: 'Gửi cảnh cáo',
    impact: 'Tác giả nhận thông báo cảnh cáo kèm lý do dưới đây; nội dung không bị gỡ.',
    danger: false,
  },
  LOCK_AUTHOR: {
    label: 'Khoá tài khoản',
    icon: 'lock-outline',
    confirmLabel: 'Khoá tài khoản',
    impact:
      'Thu hồi mọi phiên đăng nhập; người dùng mất quyền truy cập trong vòng 1 phút và không đăng nhập lại được tới khi được mở khoá.',
    danger: true,
  },
  ARCHIVE_CHANNEL: {
    label: 'Lưu trữ kênh',
    icon: 'folder-outline',
    confirmLabel: 'Lưu trữ kênh',
    impact: 'Kênh chuyển sang trạng thái lưu trữ; thành viên không gửi được tin mới.',
    danger: true,
  },
  DISSOLVE_CONVERSATION: {
    label: 'Giải tán nhóm chat',
    icon: 'ban-outline',
    confirmLabel: 'Giải tán nhóm',
    impact: 'Nhóm chuyển sang trạng thái đã giải tán; thành viên không gửi được tin mới.',
    danger: true,
  },
  DISMISS: {
    label: 'Bỏ qua',
    icon: 'circle-check-outline',
    confirmLabel: 'Bỏ qua báo cáo',
    impact: 'Báo cáo được đóng mà không tác động tới nội dung hay tài khoản nào.',
    danger: false,
  },
};

/** Thứ tự nút trong khối quyết định — "Bỏ qua" đứng cuối. */
export const ADMIN_ACTION_ORDER: readonly AdminReportAction[] = [
  'REMOVE_CONTENT',
  'WARN_AUTHOR',
  'LOCK_AUTHOR',
  'ARCHIVE_CHANNEL',
  'DISSOLVE_CONVERSATION',
  'DISMISS',
];
