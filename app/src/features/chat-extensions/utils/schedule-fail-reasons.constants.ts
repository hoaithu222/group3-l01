import type { ScheduledFailReason } from '../api/chat-extensions.types';

/**
 * Lý do tin hẹn giờ KHÔNG phát được (`ScheduledMessageView.failReason`, p7-04 be.md §5.3 bước 2–7) → câu tiếng Việt. Không lộ chi tiết nội bộ (mã `failCode` của engine) và với `BLOCKED` chỉ nói
 * "Không thể gửi" (không tiết lộ ai chặn ai — README p7-04 §10). Thiếu/lạ ⇒ `UNKNOWN`.
 */
export const SCHEDULE_FAIL_REASON_TEXT: Record<ScheduledFailReason, string> = {
  NO_PERMISSION: 'Bạn không còn quyền gửi tin ở đây',
  SCOPE_ARCHIVED: 'Kênh hoặc cuộc trò chuyện đã đóng hoặc lưu trữ',
  BLOCKED: 'Không thể gửi tin này',
  ATTACHMENT_INVALID: 'Tệp đính kèm không còn hợp lệ',
  SUB_FEATURE_OFF: 'Tính năng hẹn giờ gửi đang tạm tắt',
  AUTHOR_INACTIVE: 'Tài khoản của bạn hiện không hoạt động',
  UNKNOWN: 'Không gửi được do lỗi hệ thống',
};

export function failReasonText(reason: ScheduledFailReason | null): string {
  return SCHEDULE_FAIL_REASON_TEXT[reason ?? 'UNKNOWN'] ?? SCHEDULE_FAIL_REASON_TEXT.UNKNOWN;
}
