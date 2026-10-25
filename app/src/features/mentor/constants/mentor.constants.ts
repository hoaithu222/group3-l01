import type { BadgeVariant } from '@/shared/ui/badge';

import type {
  MentorApplicationStatus,
  MentorEndReason,
  MentorPostStatus,
  MentorReportReason,
} from '../api/mentor.types';

/** Giới hạn khớp `LIMITS.mentor` của BE (p6-03 README §7) — đổi ở BE thì đổi ở đây (không endpoint nào trả về). */
export const MENTOR_LIMITS = {
  commitmentHoursMax: 20,
  descriptionMax: 3000,
  descriptionMin: 20,
  expiresInDaysMax: 60,
  expiresInDaysMin: 3,
  includeMembersMax: 20,
  mentorsNeededMax: 3,
  messageMax: 1000,
  messageMin: 20,
  postsOpenPerWorkspace: 3,
  skillMax: 40,
  skillsMax: 10,
  titleMax: 120,
  titleMin: 5,
  totalDaysMax: 90,
} as const;

/** Thời hạn đợt cố vấn chọn nhanh khi chấp nhận (app.md §3 `AcceptMentorSheet`). */
export const DURATION_CHOICES = [7, 14, 30, 60] as const;
export const DEFAULT_DURATION_DAYS = 30;
export const EXTEND_CHOICES = [7, 14, 30] as const;

/** Trạng thái = CHỮ (không chỉ màu — app.md §3 "Đơn của tôi"). */
export const APPLICATION_STATUS_LABEL: Record<MentorApplicationStatus, string> = {
  ACCEPTED: 'Được chấp nhận',
  EXPIRED: 'Hết hạn',
  PENDING: 'Đang chờ',
  REJECTED: 'Từ chối',
  WITHDRAWN: 'Đã rút',
};

/**
 * Tông huy hiệu trạng thái đơn — MỘT bảng cho cả "Đơn của tôi" lẫn màn duyệt đơn của nhóm (trước mỗi nơi tự chọn màu). Màu chỉ là phụ:
 * chữ của `APPLICATION_STATUS_LABEL` luôn đi kèm.
 */
export const APPLICATION_STATUS_VARIANT: Record<MentorApplicationStatus, BadgeVariant> = {
  ACCEPTED: 'success',
  EXPIRED: 'neutral',
  PENDING: 'warning',
  REJECTED: 'error',
  WITHDRAWN: 'neutral',
};

export const POST_STATUS_LABEL: Record<MentorPostStatus, string> = {
  CLOSED: 'Đã đóng',
  FULFILLED: 'Đã đủ cố vấn',
  OPEN: 'Đang mở',
};

export const END_REASON_LABEL: Record<MentorEndReason, string> = {
  ENDED_BY_OWNER: 'Nhóm kết thúc',
  ENDED_BY_PLATFORM: 'Quản trị viên kết thúc',
  EXPIRED: 'Hết hạn',
  LEFT_BY_MENTOR: 'Cố vấn tự rời',
  MEMBERSHIP_REVOKED: 'Bị gỡ khỏi nhóm',
  WORKSPACE_ARCHIVED: 'Nhóm đã lưu trữ',
};

export const REPORT_REASONS: MentorReportReason[] = [
  'SPAM',
  'SCAM',
  'INAPPROPRIATE',
  'HARASSMENT',
  'IMPERSONATION',
  'OTHER',
];
export const REPORT_REASON_LABEL: Record<MentorReportReason, string> = {
  HARASSMENT: 'Quấy rối',
  IMPERSONATION: 'Mạo danh',
  INAPPROPRIATE: 'Nội dung không phù hợp',
  OTHER: 'Lý do khác',
  SCAM: 'Lừa đảo',
  SPAM: 'Spam / quảng cáo',
};
export const REPORT_OTHER_MIN = 10;

/**
 * Câu tiếng Việt cho mã `MENTOR_*` (be.md §8 + `MENTOR_010`) — đặt TRONG feature (không sửa bảng chung
 * `shared/constants/error-codes.ts`); interceptor vẫn rơi về `message` tiếng Việt của BE khi toast chung.
 */
export const MENTOR_ERROR_MESSAGES: Record<string, string> = {
  MENTOR_001: 'Nhóm đã có tối đa số bài tìm cố vấn đang mở',
  MENTOR_002: 'Bài đăng không còn nhận ứng tuyển',
  MENTOR_003: 'Bạn đã ứng tuyển bài này',
  MENTOR_004: 'Bạn đã là thành viên hoặc không thể tham gia nhóm này',
  MENTOR_005: 'Bài đã đủ cố vấn hoặc vừa thay đổi, tải lại rồi thử lại',
  MENTOR_006: 'Bạn có quá nhiều đơn đang chờ',
  MENTOR_007: 'Tổng thời gian cố vấn vượt 90 ngày',
  MENTOR_008: 'Kênh được chọn không hợp lệ hoặc bạn không quản lý kênh riêng tư đó',
  MENTOR_009: 'Đợt cố vấn đã kết thúc',
  MENTOR_010: 'Đơn ứng tuyển không còn ở trạng thái chờ',
};
