import type { LiveQuizEndReason, LiveQuizStatus } from '../types/live-quiz-ops.types';

/** Cờ tính năng của phân hệ (`capabilities.features`) — tắt thì tab ẩn khỏi trang Gamification. */
export const LIVE_QUIZ_FEATURE_FLAG = 'live-quiz';

/** Cỡ trang mặc định và các cỡ chọn được (20/50 theo admin.md p5-01 §2.1; 100 là trần `limit` của BE). */
export const LIVE_QUIZ_PAGE_SIZE = 20;
export const LIVE_QUIZ_PAGE_SIZE_OPTIONS = [20, 50, 100];

/** Sức chứa tối đa một phòng — khớp `LIMITS.liveQuiz.playersMax` của BE. */
export const LIVE_QUIZ_PLAYERS_MAX = 100;

/** Nhịp làm mới khi còn phiên đang mở (admin.md p5-01 §2.1); tab ẩn thì React Query tự dừng. */
export const LIVE_QUIZ_REFETCH_MS = 15_000;

/** Trạng thái còn mở — chỉ những phiên này mới kết thúc khẩn cấp được (`QUIZ_007` với phiên đã đóng). */
export const LIVE_QUIZ_OPEN_STATUSES: readonly LiveQuizStatus[] = ['WAITING', 'IN_PROGRESS'];

export const isLiveQuizOpen = (status: LiveQuizStatus): boolean =>
  LIVE_QUIZ_OPEN_STATUSES.includes(status);

/** Ô lọc "tất cả" — Radix Select không nhận giá trị rỗng. */
export const ALL_FILTER = 'all';

export const LIVE_QUIZ_STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL_FILTER, label: 'Mọi trạng thái' },
  { value: 'IN_PROGRESS', label: 'Đang diễn ra' },
  { value: 'WAITING', label: 'Đang chờ' },
  { value: 'FINISHED', label: 'Đã kết thúc' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
];

export const LIVE_QUIZ_STATUSES: readonly LiveQuizStatus[] = [
  'WAITING',
  'IN_PROGRESS',
  'FINISHED',
  'CANCELLED',
];

/** `endReason` → câu tiếng Việt; lý do lạ (BE thêm sau) → chính mã. */
export const LIVE_QUIZ_END_REASON_LABELS: Record<LiveQuizEndReason, string> = {
  HOST_ENDED: 'Người tổ chức kết thúc',
  HOST_TIMEOUT: 'Người tổ chức mất kết nối quá lâu',
  COMPLETED: 'Đã hết câu hỏi',
  ADMIN_ENDED: 'Quản trị nền tảng kết thúc',
  EXPIRED: 'Phiên treo quá lâu, hệ thống tự đóng',
};

export const liveQuizEndReasonLabel = (reason: string | null): string =>
  reason ? ((LIVE_QUIZ_END_REASON_LABELS as Record<string, string>)[reason] ?? reason) : '—';
