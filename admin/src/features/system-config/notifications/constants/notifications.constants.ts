import type {
  NotificationStatsRange,
  NotificationSuppressed,
} from '../types/notification-stats.types';
import type { PushTestType } from '../types/notifications-config.types';

/** Nội dung push thử do BE cố định — UI chỉ nhắc lại, KHÔNG có ô nhập nội dung. */
export const PUSH_TEST_FIXED_CONTENT = 'Đây là thông báo thử từ quản trị';

export const PUSH_TEST_TYPE_LABELS: Record<PushTestType, string> = {
  'message.new': 'Tin nhắn mới',
  'call.incoming': 'Cuộc gọi đến',
  'meeting.reminder': 'Nhắc lịch họp',
};

export const PUSH_TEST_TYPE_OPTIONS = (
  Object.entries(PUSH_TEST_TYPE_LABELS) as Array<[PushTestType, string]>
).map(([value, label]) => ({ value, label }));

/**
 * Lý do một thông báo KHÔNG được đẩy (`NotificationRecipient.skipReason`, do
 * `delivery.policy.ts`/`push.jobs.ts` ghi). Mã chưa biết vẫn hiện thô — xem `reasonLabel`.
 */
export const PUSH_SKIP_REASON_LABELS: Record<string, string> = {
  MUTED: 'Đã tắt tiếng',
  MODE: 'Chỉ nhận khi được nhắc',
  DND: 'Không làm phiền',
  VIEWING: 'Đang xem',
  NO_DEVICE: 'Không có thiết bị',
  REVOKED: 'Mất quyền truy cập',
  UNKNOWN: 'Không rõ',
};

/** Lý do một token bị gỡ (`DeviceToken.revokeReason`, `REVOKE_REASONS` phía BE). */
export const TOKEN_REVOKE_REASON_LABELS: Record<string, string> = {
  FCM_UNREGISTERED: 'FCM báo token hết hạn',
  APNS_UNREGISTERED: 'APNs báo token hết hạn',
  LOGOUT: 'Đăng xuất',
  TOKEN_ROTATED: 'Token được xoay',
  DEVICE_LIMIT: 'Vượt giới hạn thiết bị',
  STALE: 'Lâu không hoạt động',
  ADMIN: 'Quản trị gỡ',
  UNKNOWN: 'Không rõ',
};

/** Nhãn cho `code`; BE thêm mã mới mà UI chưa biết thì hiện chính mã đó thay vì trống. */
export function reasonLabel(labels: Record<string, string>, code: string): string {
  return labels[code] ?? code;
}

/** Mã lỗi `POST /admin/push/test` hiện ngay trong panel thay vì toast. */
export const PUSH_TEST_INLINE_ERRORS: ReadonlySet<string> = new Set(['PUSH_001', 'PUSH_002']);

// ── p1-07: số liệu thông báo tin nhắn gộp (`GET /admin/notifications/stats`) ──

export const NOTIFICATION_STATS_DEFAULT_RANGE = '24h' as const;

/** Khoảng đang xem nằm trên URL (`?notifRange=7d`; mặc định `24h` thì bỏ khoá) — tiền tố tránh đụng tab khác. */
export const NOTIFICATION_STATS_RANGE_PARAM = 'notifRange';

export const NOTIFICATION_STATS_RANGE_OPTIONS: ReadonlyArray<{
  key: NotificationStatsRange;
  label: string;
}> = [
  { key: '24h', label: '24 giờ' },
  { key: '7d', label: '7 ngày' },
];

/** Lý do một push bị chặn — khoá viết thường đúng như BE (`PushSkipReason`), thứ tự hiển thị cố định. */
export const NOTIFICATION_SUPPRESS_REASONS: ReadonlyArray<{
  key: keyof NotificationSuppressed;
  label: string;
}> = [
  { key: 'muted', label: 'Đã tắt tiếng' },
  { key: 'dnd', label: 'Không làm phiền' },
  { key: 'viewing', label: 'Đang xem' },
  { key: 'read', label: 'Đã đọc' },
  { key: 'blocked', label: 'Đã chặn' },
];

/** Loại push (`byType`) — loại lạ BE thêm sau vẫn hiện thô qua `reasonLabel`. */
export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  'message.new': 'Tin nhắn mới',
  mention: 'Nhắc tên',
  'thread.reply': 'Trả lời trong luồng',
};

/** Tác động hiển thị khi lưu khoá `notification.defaults` (thay câu chung ở thẻ nhóm cấu hình). */
export const NOTIFICATION_DEFAULTS_SAVE_IMPACT =
  'Áp dụng cho người dùng chưa tự chỉnh cài đặt thông báo; không đổi cài đặt người dùng đã chọn. Có hiệu lực trong ≤ 60 giây.';
