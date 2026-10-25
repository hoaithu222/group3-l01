import type {
  ReportReason,
  ReportResolution,
  ReportStatus,
  ReportTargetType,
  ResolveAction,
} from '../api/moderation.types';

/** Lý do báo cáo — thứ tự và nhãn theo README p1-08 §3.1; dòng mô tả ngắn để người dùng chọn đúng (app.md §7). */
export const REPORT_REASON_OPTIONS: readonly { value: ReportReason; label: string; description: string }[] = [
  { value: 'SPAM', label: 'Spam', description: 'Quảng cáo, tin lặp lại hoặc liên kết rác' },
  { value: 'HARASSMENT', label: 'Quấy rối', description: 'Xúc phạm, đe doạ hoặc làm phiền người khác' },
  { value: 'INAPPROPRIATE', label: 'Nội dung không phù hợp', description: 'Nội dung nhạy cảm, bạo lực hoặc trái quy định' },
  { value: 'SCAM', label: 'Lừa đảo', description: 'Chiếm đoạt tiền, thông tin hoặc mời chào đáng ngờ' },
  { value: 'IMPERSONATION', label: 'Mạo danh', description: 'Giả làm người hoặc tổ chức khác' },
  { value: 'OTHER', label: 'Khác', description: 'Lý do khác — cần mô tả ít nhất 10 ký tự' },
];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Quấy rối',
  INAPPROPRIATE: 'Nội dung không phù hợp',
  SCAM: 'Lừa đảo',
  IMPERSONATION: 'Mạo danh',
  OTHER: 'Khác',
};

export const REPORT_TARGET_LABEL: Record<ReportTargetType, string> = {
  MESSAGE: 'Tin nhắn',
  USER: 'Người dùng',
  CHANNEL: 'Kênh',
  CONVERSATION: 'Nhóm chat',
};

/** Trạng thái của TAB hàng đợi — `key` trùng giá trị `status` mà BE nhận. */
export const QUEUE_TABS: readonly { key: ReportStatus; label: string }[] = [
  { key: 'OPEN', label: 'Đang mở' },
  { key: 'RESOLVED', label: 'Đã xử lý' },
  { key: 'DISMISSED', label: 'Đã bỏ qua' },
];

export const QUEUE_EMPTY_TEXT: Record<ReportStatus, string> = {
  OPEN: 'Không có báo cáo nào cần xử lý',
  RESOLVED: 'Chưa có báo cáo nào được xử lý',
  DISMISSED: 'Chưa có báo cáo nào bị bỏ qua',
};

export const RESOLUTION_LABEL: Record<ReportResolution, string> = {
  CONTENT_REMOVED: 'Đã gỡ nội dung',
  AUTHOR_WARNED: 'Đã cảnh cáo tác giả',
  USER_LOCKED: 'Đã khoá tài khoản',
  CHANNEL_ARCHIVED: 'Đã lưu trữ kênh',
  CONVERSATION_DISSOLVED: 'Đã giải tán nhóm chat',
  NO_ACTION: 'Không cần xử lý',
};

/** Giới hạn khớp `LIMITS.report` phía BE (`descriptionMax`, `otherDescriptionMin`) và `reasonSchema` (10–500). */
export const REPORT_LIMITS = { descriptionMax: 1000, otherDescriptionMin: 10 } as const;
export const RESOLVE_REASON_LIMITS = { min: 10, max: 500 } as const;

export interface ResolveActionCopy {
  /** Nhãn nút trong tấm chi tiết. */
  button: string;
  /** Tiêu đề bước nhập lý do. */
  title: string;
  /** Hậu quả nói THẲNG — không dùng từ "Kick/Ban". */
  consequence: string;
  confirm: string;
  danger: boolean;
}

export const RESOLVE_ACTION_COPY: Record<ResolveAction, ResolveActionCopy> = {
  REMOVE_MESSAGE: {
    button: 'Gỡ tin nhắn',
    title: 'Gỡ tin nhắn này?',
    consequence: 'Tin sẽ hiện là đã bị gỡ với mọi người, và không thể hoàn tác. Tác giả nhận được lý do bạn nhập.',
    confirm: 'Gỡ tin nhắn',
    danger: true,
  },
  WARN_AUTHOR: {
    button: 'Cảnh cáo tác giả',
    title: 'Cảnh cáo tác giả?',
    consequence: 'Tác giả nhận được thông báo kèm lý do bạn nhập. Nội dung được giữ nguyên.',
    confirm: 'Cảnh cáo',
    danger: false,
  },
  DISMISS: {
    button: 'Bỏ qua báo cáo',
    title: 'Bỏ qua báo cáo này?',
    consequence: 'Cả nhóm báo cáo về cùng đích sẽ được đóng mà không xử lý gì thêm.',
    confirm: 'Bỏ qua',
    danger: false,
  },
};
